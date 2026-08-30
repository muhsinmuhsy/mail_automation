import { PrismaClient } from '../generated/prisma/client';
import {
  reserveEmailCapacity,
  commitReservation,
  releaseReservation,
} from '../limits/email-limit-service';
import { sendEmail } from '../email/service';
import { decryptSecret } from '../security/encryption';
import { createStorageService } from '../storage/storage.factory';

const MAX_ATTEMPTS = 3;

function contentTypeForFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc':
      return 'application/msword';
    case 'txt':
      return 'text/plain';
    case 'rtf':
      return 'application/rtf';
    default:
      return 'application/octet-stream';
  }
}

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
  jobId: string
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

    const resume = await prisma.resume.findUnique({
      where: { id: job.resume_id, user_id: job.user_id, deleted_at: null },
    });

    if (!resume) {
      throw new Error('Resume is unavailable for this email job.');
    }
    const storage = createStorageService(env);
    const stream = await storage.download(resume.storage_key);
    if (!stream) {
      throw new Error('Resume object is unavailable for this email job.');
    }
    const content = new Uint8Array(await new Response(stream).arrayBuffer());
    const attachment = {
      filename: resume.filename,
      content,
      contentType: contentTypeForFilename(resume.filename),
    };

    try {
      const decryptedSecret = emailAccount.encrypted_secret
        ? await decryptSecret(emailAccount.encrypted_secret, encryptionKey(env))
        : '';

      const result = await sendEmail({
        provider: emailAccount.provider,
        from: emailAccount.email,
        to: job.to_email,
        subject: job.subject,
        body: job.body,
        attachment: attachment ? attachment : undefined,
        credentials: {
          email: emailAccount.email,
          secret: decryptedSecret,
        },
      });

      if (result.success) {
        await prisma.emailJob.update({
          where: { id: jobId },
          data: { status: 'SENT', sent_at: new Date() },
        });

        await prisma.emailLog.create({
          data: {
            email_job_id: jobId,
            status: 'SENT',
            smtp_response: result.smtpResponse || null,
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
          status: isPermanent ? 'SMTP_AUTH_FAILED' : 'SMTP_TEMPORARY_FAILURE',
          smtp_response: result.error || null,
          error_message: result.error || 'Delivery attempt failed.',
        },
      });

      await releaseReservation(prisma, {
        userId: job.user_id,
        campaignId: job.campaign_id ?? undefined,
        emailJobId: jobId,
      });
    } catch {
      // Worker crashed during/after the provider call — we cannot know the
      // outcome, so mark DELIVERY_UNKNOWN and free the reservation. A later
      // reconciliation pass will settle the counters.
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
    }
  } catch {
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
