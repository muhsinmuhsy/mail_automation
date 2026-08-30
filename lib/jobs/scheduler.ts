import { PrismaClient, Prisma } from '../generated/prisma/client';
import { replaceTemplateVariables } from '@/lib/email/template';

function wallClockToUTC(wallClock: Date, timezone: string): Date {
  const year = wallClock.getUTCFullYear();
  const month = wallClock.getUTCMonth();
  const day = wallClock.getUTCDate();
  const hour = wallClock.getUTCHours();
  const minute = wallClock.getUTCMinutes();

  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const naiveDate = new Date(Date.UTC(year, month, day, hour, minute, 0));
  const parts = tzFormatter.formatToParts(naiveDate);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  const naiveUTC = naiveDate.getTime();
  const adjustedUTC = Date.UTC(
    parseInt(values.year),
    parseInt(values.month) - 1,
    parseInt(values.day),
    parseInt(values.hour),
    parseInt(values.minute),
    parseInt(values.second || '0')
  );

  return new Date(naiveUTC + (naiveUTC - adjustedUTC));
}

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
    resume_id: string;
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

  const maxPerDay = campaign.daily_limit ?? Infinity;
  const utcStartAt = wallClockToUTC(campaign.start_at, campaign.timezone);

  const jobs = contacts.map((contact, index) => {
    const dayIndex = Math.floor(index / maxPerDay);
    const slotInDay = index % maxPerDay;

    const scheduledAt = new Date(utcStartAt);
    scheduledAt.setUTCDate(scheduledAt.getUTCDate() + dayIndex);
    scheduledAt.setUTCMinutes(scheduledAt.getUTCMinutes() + slotInDay * campaign.interval_minutes);
    scheduledAt.setUTCSeconds(0, 0);

    return {
      user_id: campaign.user_id,
      campaign_id: campaign.id,
      contact_id: contact.id,
      email_account_id: campaign.email_account_id,
      resume_id: campaign.resume_id,
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
      SELECT id FROM email_jobs
      WHERE
        (status = 'SCHEDULED' AND scheduled_at <= now())
        OR (status = 'RETRY_WAIT' AND next_attempt_at <= now())
      ORDER BY COALESCE(next_attempt_at, scheduled_at)
      LIMIT 100
    )
    AND status IN ('SCHEDULED', 'RETRY_WAIT')
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
