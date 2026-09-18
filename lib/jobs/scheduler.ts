import { campaignEmailTime } from '@/lib/scheduling/campaign';
import { PrismaClient, type EmailJobStatus } from '../generated/prisma/client';
import type { TransactionClient } from '@/lib/db';
import { replaceTemplateVariables } from '@/lib/email/template';
import { buildTemplateContact, type ContactFieldDefinition, type ContactFieldValueRow } from '@/lib/email/template-contact';
import type { PreparedJob } from '@/lib/campaigns/eligibility';

type DbClient = PrismaClient | TransactionClient;

/**
 * Create campaign jobs from a prepared snapshot inside a transaction.
 *
 * The prepared snapshot comes from `computeEligibility` — it contains
 * pre-rendered subject/body/bodyHtml and a deterministic creation_key for
 * each recipient. This function does NOT re-read contacts or templates;
 * it consumes exactly the snapshot computed under the eligibility lock.
 *
 * Per docs/CAMPAIGN/_DEDUPLICATION.md §5.1, the first parameter accepts
 * `TransactionClient` (a subset of PrismaClient with the same delegates).
 */
export async function createCampaignJobsFromSnapshot(
  db: DbClient,
  campaign: {
    id: string;
    user_id: string;
    email_account_id: string;
    attachment_id?: string | null;
    attachment_ids?: string[];
    template_id: string;
  },
  preparedJobs: PreparedJob[]
): Promise<void> {
  if (preparedJobs.length === 0) return;

  const attachmentIds = campaign.attachment_ids ?? (campaign.attachment_id ? [campaign.attachment_id] : []);

  const data = preparedJobs.map((job) => ({
    user_id: campaign.user_id,
    campaign_id: campaign.id,
    contact_id: job.contactId,
    email_account_id: campaign.email_account_id,
    attachment_id: campaign.attachment_id ?? null,
    attachment_ids: attachmentIds,
    template_id: campaign.template_id,
    to_email: job.toEmail,
    subject: job.subject,
    body: job.body,
    body_html: job.bodyHtml,
    creation_key: job.creationKey,
    scheduled_at: job.scheduledAt,
    status: 'SCHEDULED' as const,
    attempt_count: 0,
  }));

  await db.emailJob.createMany({ data });
}

/**
 * Legacy job generation — reads contacts/template and renders snapshots.
 *
 * @deprecated Use `createCampaignJobsFromSnapshot` with a prepared snapshot
 *   from `computeEligibility` for new campaign creation. This function is
 *   retained for backward compatibility with existing callers that have not
 *   yet migrated to the eligibility service.
 */
export async function generateCampaignJobs(
  prisma: DbClient,
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
  const [contacts, fieldDefs] = await Promise.all([
    prisma.contact.findMany({
      where: { id: { in: contactIds }, user_id: campaign.user_id },
      include: { contact_field_values: { select: { field_id: true, value: true } } },
    }),
    prisma.contactField.findMany({
      where: { user_id: campaign.user_id },
      select: { id: true, name: true, field_type: true },
    }),
  ]);

  if (contacts.length === 0) return;

  const template = await prisma.template.findUnique({
    where: { id: campaign.template_id },
  });
  if (!template) {
    throw new Error(`Template ${campaign.template_id} not found for campaign ${campaign.id}`);
  }

  const fieldDefinitions = fieldDefs as ContactFieldDefinition[];

  const jobs = contacts.map((contact, index) => {
    const scheduledAt = campaignEmailTime(new Date(campaign.start_at), index, campaign.interval_minutes, campaign.daily_limit ?? null);

    const templateContact = buildTemplateContact(
      {
        name: contact.name,
        email: contact.email,
      },
      contact.contact_field_values as ContactFieldValueRow[],
      fieldDefinitions
    );

    const bodyText = template.body_text ?? template.body;
    const bodyHtml = template.body_html ?? null;

    return {
      user_id: campaign.user_id,
      campaign_id: campaign.id,
      contact_id: contact.id,
      email_account_id: campaign.email_account_id,
      attachment_id: campaign.attachment_id,
      attachment_ids: campaign.attachment_ids ?? (campaign.attachment_id ? [campaign.attachment_id] : []),
      template_id: campaign.template_id,
      to_email: contact.email,
      subject: replaceTemplateVariables(template.subject, templateContact),
      body: replaceTemplateVariables(bodyText, templateContact),
      body_html: bodyHtml ? replaceTemplateVariables(bodyHtml, templateContact) : null,
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

const TERMINAL_JOB_STATUSES: EmailJobStatus[] = ['SENT', 'FAILED', 'CANCELLED', 'DELIVERY_UNKNOWN'];

/**
 * Marks every `ACTIVE` campaign whose jobs are all in a terminal state as
 * `COMPLETED`. Paused/cancelled/draft campaigns are intentionally excluded so
 * a paused campaign can still be resumed. Runs idempotently each minute.
 */
export async function completeFinishedCampaigns(prisma: PrismaClient): Promise<string[]> {
  const activeCampaigns = await prisma.campaign.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });

  if (activeCampaigns.length === 0) return [];

  const activeIds = activeCampaigns.map(c => c.id);

  const campaignsPending = await prisma.emailJob.groupBy({
    by: ['campaign_id'],
    where: {
      campaign_id: { in: activeIds },
      status: { notIn: TERMINAL_JOB_STATUSES },
    },
  });

  const pendingSet = new Set(campaignsPending.map(g => g.campaign_id));
  const finishedIds = activeIds.filter(id => !pendingSet.has(id));

  if (finishedIds.length === 0) return [];

  await prisma.campaign.updateMany({
    where: { id: { in: finishedIds } },
    data: { status: 'COMPLETED' },
  });

  return finishedIds;
}
