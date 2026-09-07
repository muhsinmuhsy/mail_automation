import { getAttachmentPolicy } from '@/lib/email/providers/attachment-policies';
import { attachmentContentType } from '@/lib/attachments/file-types';
import { PrismaClient } from '../generated/prisma/client';
import {
  reserveEmailCapacity,
  commitReservation,
  releaseReservation,
} from '../limits/email-limit-service';
import { sendEmail } from '../email/service';
import { decryptSecret } from '../security/encryption';
import { createStorageService } from '../storage/storage.factory';
import type { ProviderOptions } from '../email/providers/types';
import { gmailAccessToken } from '../email/accounts/credential-service';
import { ReconnectRequiredError } from '../email/providers/gmail/oauth';

const MAX_ATTEMPTS = 3;

function encryptionKey(env: Record<string, unknown>): string {
  const key = (env.SMTP_ENCRYPTION_KEY as string) ?? process.env.SMTP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('SMTP_ENCRYPTION_KEY is not configured.');
  }
  return key;
}

export async function processQueueJob(
  prisma: PrismaClient,
  env: Record<string, unknown>,
  jobId: string,
  providerOptions?: ProviderOptions
): Promise<void> {
  const job = await prisma.emailJob.findUnique({
    where: { id: jobId },
    include: { campaign: true },
  });

  if (!job) {
    return;
  }

  const claimed = await prisma.emailJob.updateMany({
    where: { id: jobId, status: 'QUEUED' },
    data: {
      status: 'PROCESSING',
      attempt_count: { increment: 1 },
      processing_started_at: new Date(),
    },
  });

  if (claimed.count === 0) {
    return;
  }

  const attemptNumber = job.attempt_count + 1;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let deliveryMayHaveOccurred = false;

  try {
    const user = await prisma.user.findUnique({ where: { id: job.user_id } });
    if (!user || !user.is_active) {
      await prisma.emailJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error_message: 'User account is inactive.' },
      });
      return;
    }

    if (job.campaign) {
      if (job.campaign.status === 'PAUSED' || job.campaign.status === 'CANCELLED') {
        await prisma.emailJob.update({
          where: { id: jobId },
          data: { status: 'CANCELLED', error_message: 'Campaign is paused or cancelled.' },
        });
        return;
      }
    }

    const reservation = await reserveEmailCapacity(prisma, {
      userId: job.user_id,
      campaignId: job.campaign_id ?? undefined,
      emailJobId: jobId,
      attemptNumber,
    });

    if (!reservation.success) {
      const nextAttempt = new Date();
      nextAttempt.setUTCDate(nextAttempt.getUTCDate() + 1);
      nextAttempt.setUTCHours(0, 0, 0, 0);

      await prisma.emailJob.update({
        where: { id: jobId },
        data: {
          status: 'RETRY_WAIT',
          next_attempt_at: nextAttempt,
          error_message: reservation.reason,
        },
      });
      return;
    }

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: job.email_account_id },
    });

    if (!emailAccount || !emailAccount.is_active) {
      await prisma.emailJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error_message: 'Email account is inactive.' },
      });
      await releaseReservation(prisma, {
        userId: job.user_id,
        campaignId: job.campaign_id ?? undefined,
        emailJobId: jobId,
      });
      return;
    }

    const policy = getAttachmentPolicy(emailAccount.provider);
    if (!policy) throw new Error('Attachment policy is not configured for this provider.');
    const attachmentIds = job.attachment_ids?.length ? job.attachment_ids : (job.attachment_id ? [job.attachment_id] : []);
    const attachmentEmails = [];
    let totalBytes = 0;
    if (attachmentIds.length > policy.maxCount) throw new Error('Too many attachments.');
    for (const id of attachmentIds) {
      const attachment = await prisma.attachment.findUnique({
        where: { id, user_id: job.user_id, deleted_at: null },
      });
      if (!attachment) throw new Error('Attachment is unavailable for this email job.');
      const stream = await createStorageService(env).download(attachment.storage_key);
      const content = new Uint8Array(await new Response(stream).arrayBuffer());
      totalBytes += content.byteLength;
      if (totalBytes > policy.maxTotalBytes) throw new Error('Attachments exceed the provider total size limit.');
      if (content.byteLength > policy.maxFileBytes) throw new Error('Attachment exceeds the provider file size limit.');
      attachmentEmails.push({ filename: attachment.filename, content, contentType: attachmentContentType(attachment.filename) });
    }

    let accepted = false;
    try {
      let decryptedSecret = emailAccount.auth_method === 'oauth2'
        ? await gmailAccessToken(prisma, emailAccount, env)
        : emailAccount.encrypted_secret
        ? await decryptSecret(emailAccount.encrypted_secret, encryptionKey(env))
        : '';

      // `accepted` distinguishes a crash *after* the provider accepted the
      // message (→ DELIVERY_UNKNOWN, never auto-retry) from a thrown error
      // before acceptance (→ temporary failure, safe to retry).
      const sendParams = {
        ...(providerOptions ? { providerOptions } : {}),
        ...(emailAccount.auth_method === 'oauth2' ? { providerOptions: { ...providerOptions, authMethod: 'oauth2' as const } } : {}),
        provider: emailAccount.provider,
        from: emailAccount.email,
        to: job.to_email,
        subject: job.subject,
        body: job.body,
        attachments: attachmentEmails,
        credentials: {
          email: emailAccount.email,
          secret: decryptedSecret,
        },
      };
      let result = await sendEmail(sendParams);
      // A 401 is an explicit rejection, so one refresh and retry is safe.
      if (result.reconnectRequired && emailAccount.auth_method === 'oauth2') {
        const current = await prisma.emailAccount.findUnique({ where: { id: emailAccount.id } });
        if (!current) throw new ReconnectRequiredError();
        decryptedSecret = await gmailAccessToken(prisma, current, env, true);
        result = await sendEmail({ ...sendParams, credentials: { email: emailAccount.email, secret: decryptedSecret } });
      }

      if (result.success) {
        accepted = true;
        deliveryMayHaveOccurred = true;
        await prisma.emailJob.update({
          where: { id: jobId },
          data: { status: 'SENT', sent_at: new Date() },
        });

        await prisma.emailLog.create({
          data: {
            email_job_id: jobId,
            status: 'SENT',
            smtp_response: result.providerResponse || result.smtpResponse || result.messageId || null,
            error_message: null,
          },
        });

        await commitReservation(prisma, {
          userId: job.user_id,
          campaignId: job.campaign_id ?? undefined,
          emailJobId: jobId,
        });
        return;
      }

      if (result.errorType === 'unknown') {
        accepted = true;
        deliveryMayHaveOccurred = true;
        throw new Error('Provider acceptance is unknown.');
      }
      if (result.reconnectRequired) {
        const current = await prisma.emailAccount.findUnique({ where: { id: emailAccount.id } });
        if (current?.encrypted_secret && await decryptSecret(current.encrypted_secret, encryptionKey(env)) === decryptedSecret) {
          await prisma.emailAccount.updateMany({
            where: { id: emailAccount.id, updated_at: current.updated_at, encrypted_secret: current.encrypted_secret },
            data: { is_active: false, connection_error: 'reconnect_required' },
          });
        }
      }
      const isPermanent = result.errorType === 'permanent';
      const reachedMax = attemptNumber >= MAX_ATTEMPTS;

      if (!isPermanent && !reachedMax) {
        const backoffMinutes = attemptNumber === 1 ? 2 : 5;
        const nextAttempt = new Date();
        nextAttempt.setUTCMinutes(nextAttempt.getUTCMinutes() + backoffMinutes);

        await prisma.emailJob.update({
          where: { id: jobId },
          data: {
            status: 'RETRY_WAIT',
            next_attempt_at: nextAttempt,
            error_message: result.error || 'Temporary failure, will retry.',
          },
        });
      } else {
        await prisma.emailJob.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            error_message: result.error || 'Max attempts reached or permanent failure.',
          },
        });
      }

      await prisma.emailLog.create({
        data: {
          email_job_id: jobId,
          status: emailAccount.auth_method === 'oauth2' ? (isPermanent ? 'PROVIDER_REJECTED' : 'PROVIDER_TEMPORARY_FAILURE') : (isPermanent ? 'SMTP_AUTH_FAILED' : 'SMTP_TEMPORARY_FAILURE'),
          smtp_response: result.error || null,
          error_message: result.error || 'Delivery attempt failed.',
        },
      });

      await releaseReservation(prisma, {
        userId: job.user_id,
        campaignId: job.campaign_id ?? undefined,
        emailJobId: jobId,
      });
    } catch (error) {
      if (error instanceof ReconnectRequiredError) {
        await releaseReservation(prisma, { userId: job.user_id, campaignId: job.campaign_id ?? undefined, emailJobId: jobId });
        await prisma.emailJob.update({ where: { id: jobId }, data: { status: 'FAILED', error_message: error.message } });
        return;
      }
      if (accepted) {
        // The provider accepted the message but bookkeeping crashed afterwards.
        // Treat as potentially-sent: mark DELIVERY_UNKNOWN and keep the
        // reservation reserved pending admin review (never auto-retry).
        await prisma.emailJob.update({
          where: { id: jobId },
          data: {
            status: 'DELIVERY_UNKNOWN',
            error_message: 'Worker crashed after provider acceptance or unknown error.',
          },
        });

        await prisma.emailLog.create({
          data: {
            email_job_id: jobId,
            status: 'UNKNOWN',
            smtp_response: null,
            error_message: 'Worker crashed after provider acceptance or unknown error.',
          },
        });
      } else {
        // The provider call threw before acceptance (network/TLS/timeout). This
        // is a temporary failure, so release the reservation and retry.
        await releaseReservation(prisma, {
          userId: job.user_id,
          campaignId: job.campaign_id ?? undefined,
          emailJobId: jobId,
        }).catch(() => {});
        await prisma.emailJob
          .update({
            where: { id: jobId },
            data: {
              status: attemptNumber < MAX_ATTEMPTS ? 'RETRY_WAIT' : 'FAILED',
              next_attempt_at:
                attemptNumber < MAX_ATTEMPTS
                  ? new Date(Date.now() + (attemptNumber === 1 ? 2 : 5) * 60_000)
                  : null,
              error_message: 'The email provider could not be reached. Will retry.',
            },
          })
          .catch(() => {});
        await prisma.emailLog
          .create({
            data: {
              email_job_id: jobId,
              status: 'SMTP_TEMPORARY_FAILURE',
              smtp_response: null,
              error_message: 'The email provider could not be reached. Will retry.',
            },
          })
          .catch(() => {});
      }
    }
  } catch {
    // If recording an accepted/unknown result also fails, leave the reservation
    // intact for stuck-job recovery. Never convert this to a retryable send.
    if (deliveryMayHaveOccurred) throw new Error('Delivery outcome requires recovery.');
    // Failures before the provider call (for example B2 retrieval) are known
    // not to have delivered a message, so their reservation is safe to release.
    await releaseReservation(prisma, {
      userId: job.user_id,
      campaignId: job.campaign_id ?? undefined,
      emailJobId: jobId,
    }).catch(() => {});
    await prisma.emailJob
      .update({
        where: { id: jobId },
        data: {
          status: attemptNumber < MAX_ATTEMPTS ? 'RETRY_WAIT' : 'FAILED',
          next_attempt_at: attemptNumber < MAX_ATTEMPTS
            ? new Date(Date.now() + (attemptNumber === 1 ? 2 : 5) * 60_000)
            : null,
          error_message: 'A required email resource could not be loaded.',
        },
      })
      .catch(() => {});
  }
}
