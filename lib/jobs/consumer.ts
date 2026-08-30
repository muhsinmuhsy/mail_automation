import { PrismaClient } from '../generated/prisma/client';
import { reserveEmailCapacity } from '../limits/email-limit-service';
import { sendEmail } from '../email/service';
import { decryptSecret } from '../security/encryption';
import { createStorageService } from '../storage/storage.factory';

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
      const campaign = await prisma.campaign.findUnique({ where: { id: job.campaign_id! } });
      if (!campaign || campaign.status === 'PAUSED' || campaign.status === 'CANCELLED') {
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

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      await prisma.emailSendReservation.updateMany({
        where: { email_job_id: jobId },
        data: { status: 'RELEASED', resolved_at: new Date() },
      });

      await prisma.emailUsageDaily.update({
        where: { user_id_usage_date: { user_id: job.user_id, usage_date: today } },
        data: { reserved_count: { decrement: 1 } },
      });

      await prisma.systemUsageDaily.update({
        where: { usage_date: today },
        data: { reserved_count: { decrement: 1 } },
      });

      if (job.campaign_id) {
        await prisma.campaignUsageDaily.update({
          where: { campaign_id_usage_date: { campaign_id: job.campaign_id, usage_date: today } },
          data: { reserved_count: { decrement: 1 } },
        });
      }
      return;
    }

    const template = await prisma.template.findUnique({
      where: { id: job.template_id },
    });

    if (!template) {
      await prisma.emailJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error_message: 'Template not found.' },
      });

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      await prisma.emailSendReservation.updateMany({
        where: { email_job_id: jobId },
        data: { status: 'RELEASED', resolved_at: new Date() },
      });

      await prisma.emailUsageDaily.update({
        where: { user_id_usage_date: { user_id: job.user_id, usage_date: today } },
        data: { reserved_count: { decrement: 1 } },
      });

      await prisma.systemUsageDaily.update({
        where: { usage_date: today },
        data: { reserved_count: { decrement: 1 } },
      });

      if (job.campaign_id) {
        await prisma.campaignUsageDaily.update({
          where: { campaign_id_usage_date: { campaign_id: job.campaign_id, usage_date: today } },
          data: { reserved_count: { decrement: 1 } },
        });
      }
      return;
    }

    const resume = await prisma.resume.findUnique({
      where: { id: job.resume_id, user_id: job.user_id, deleted_at: null },
    });

    let attachment:
      | { filename: string; content: ArrayBuffer; contentType: string }
      | undefined;

    if (resume) {
      try {
        const storage = createStorageService(env);
        const stream = await storage.download(resume.storage_key);
        if (stream) {
          const content = await new Response(stream).arrayBuffer();
          attachment = {
            filename: resume.filename,
            content,
            contentType: 'application/pdf',
          };
        }
      } catch {
        // Storage failure must not crash the whole job; send without attachment.
        attachment = undefined;
      }
    }

    try {
      const decryptedSecret = emailAccount.encrypted_secret
        ? await decryptSecret(emailAccount.encrypted_secret, (env.SMTP_ENCRYPTION_KEY as string) || process.env.SMTP_ENCRYPTION_KEY!)
        : '';

      const result = await sendEmail({
        provider: emailAccount.provider,
        from: emailAccount.email,
        to: job.to_email,
        subject: template.subject,
        body: template.body,
        attachment,
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

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        await prisma.emailSendReservation.updateMany({
          where: { email_job_id: jobId },
          data: { status: 'COMMITTED', resolved_at: new Date() },
        });

        await prisma.emailUsageDaily.update({
          where: { user_id_usage_date: { user_id: job.user_id, usage_date: today } },
          data: { reserved_count: { decrement: 1 }, sent_count: { increment: 1 } },
        });

        await prisma.systemUsageDaily.update({
          where: { usage_date: today },
          data: { reserved_count: { decrement: 1 }, sent_count: { increment: 1 } },
        });

        if (job.campaign_id) {
          await prisma.campaignUsageDaily.update({
            where: { campaign_id_usage_date: { campaign_id: job.campaign_id, usage_date: today } },
            data: { reserved_count: { decrement: 1 }, sent_count: { increment: 1 } },
          });
        }
      } else {
        const isPermanent = result.errorType === 'permanent';
        const maxAttempts = 3;

        if (!isPermanent && job.attempt_count < maxAttempts) {
          const backoffMinutes = job.attempt_count === 1 ? 2 : 5;
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
            status: result.errorType === 'permanent' ? 'SMTP_AUTH_FAILED' : 'SMTP_TEMPORARY_FAILURE',
            smtp_response: result.error || null,
            error_message: result.error || 'Max attempts reached or permanent failure.',
          },
        });

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        await prisma.emailSendReservation.updateMany({
          where: { email_job_id: jobId },
          data: { status: 'RELEASED', resolved_at: new Date() },
        });

        await prisma.emailUsageDaily.update({
          where: { user_id_usage_date: { user_id: job.user_id, usage_date: today } },
          data: { reserved_count: { decrement: 1 } },
        });

        await prisma.systemUsageDaily.update({
          where: { usage_date: today },
          data: { reserved_count: { decrement: 1 } },
        });

        if (job.campaign_id) {
          await prisma.campaignUsageDaily.update({
            where: { campaign_id_usage_date: { campaign_id: job.campaign_id, usage_date: today } },
            data: { reserved_count: { decrement: 1 } },
          });
        }
      }
    } catch {
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
    await prisma.emailJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        error_message: 'Unexpected error during processing.',
      },
    });
  }
}
