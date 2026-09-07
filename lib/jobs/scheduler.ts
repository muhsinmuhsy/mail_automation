import { campaignEmailTime } from '@/lib/scheduling/campaign';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { replaceTemplateVariables } from '@/lib/email/template';

export async function generateCampaignJobs(
  prisma: PrismaClient,
  campaign: {
    id: string;
    user_id: string;
    start_at: Date;
    timezone: string;
    interval_minutes: number;
    daily_limit?: number | null;
    email_account_id: string;
    attachment_id?: string | null;
    attachment_ids?: string[];
    template_id: string;
  },
  contactIds: string[]
): Promise<void> {
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, user_id: campaign.user_id },
  });

  if (contacts.length === 0) return;

  const template = await prisma.template.findUnique({
    where: { id: campaign.template_id },
  });
  if (!template) {
    throw new Error(`Template ${campaign.template_id} not found for campaign ${campaign.id}`);
  }

  const jobs = contacts.map((contact, index) => {
    const scheduledAt = campaignEmailTime(new Date(campaign.start_at), index, campaign.interval_minutes, campaign.daily_limit ?? null);

    return {
      user_id: campaign.user_id,
      campaign_id: campaign.id,
      contact_id: contact.id,
      email_account_id: campaign.email_account_id,
      attachment_id: campaign.attachment_id,
      attachment_ids: campaign.attachment_ids ?? (campaign.attachment_id ? [campaign.attachment_id] : []),
      template_id: campaign.template_id,
      to_email: contact.email,
      subject: replaceTemplateVariables(template.subject, contact),
      body: replaceTemplateVariables(template.body, contact),
      scheduled_at: scheduledAt,
      status: 'SCHEDULED' as const,
      attempt_count: 0,
    };
  });

  await prisma.emailJob.createMany({ data: jobs });
}

export async function scheduleDueJobs(prisma: PrismaClient): Promise<string[]> {
  const dueJobs = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE email_jobs
    SET status = 'QUEUED', updated_at = now()
    WHERE id IN (
      SELECT email_jobs.id
      FROM email_jobs
      LEFT JOIN campaigns ON campaigns.id = email_jobs.campaign_id
      WHERE
        (
          (email_jobs.status = 'SCHEDULED' AND email_jobs.scheduled_at <= now())
          OR (email_jobs.status = 'RETRY_WAIT' AND email_jobs.next_attempt_at <= now())
          OR (email_jobs.status = 'QUEUED' AND email_jobs.updated_at <= now() - interval '10 minutes')
        )
        AND (
          email_jobs.campaign_id IS NULL
          OR campaigns.status = 'ACTIVE'
        )
      ORDER BY COALESCE(email_jobs.next_attempt_at, email_jobs.scheduled_at)
      LIMIT 100
    )
    AND status IN ('SCHEDULED', 'RETRY_WAIT', 'QUEUED')
    RETURNING id
  `;

  return dueJobs.map((row: { id: string }) => row.id);
}

export async function recoverStuckJobs(prisma: PrismaClient): Promise<void> {
  const threshold = new Date();
  threshold.setUTCMinutes(threshold.getUTCMinutes() - 10);

  await prisma.emailJob.updateMany({
    where: {
      status: 'PROCESSING',
      processing_started_at: { lt: threshold },
    },
    data: {
      status: 'DELIVERY_UNKNOWN',
      error_message: 'Job was stuck in processing for more than 10 minutes.',
    },
  });
}

const TERMINAL_JOB_STATUSES = ['SENT', 'FAILED', 'CANCELLED', 'DELIVERY_UNKNOWN'];

/**
 * Marks every `ACTIVE` campaign whose jobs are all in a terminal state as
 * `COMPLETED`. Paused/cancelled/draft campaigns are intentionally excluded so
 * a paused campaign can still be resumed. Runs idempotently each minute.
 */
export async function completeFinishedCampaigns(prisma: PrismaClient): Promise<string[]> {
  const finished = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE campaigns
    SET status = 'COMPLETED', updated_at = now()
    WHERE status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM email_jobs
        WHERE email_jobs.campaign_id = campaigns.id
          AND email_jobs.status NOT IN (${Prisma.join(TERMINAL_JOB_STATUSES)})
      )
    RETURNING id
  `;

  return finished.map((row: { id: string }) => row.id);
}
