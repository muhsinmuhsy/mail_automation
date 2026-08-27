import { PrismaClient } from '../generated/prisma/client';

export async function generateCampaignJobs(
  prisma: PrismaClient,
  campaign: {
    id: string;
    user_id: string;
    start_at: Date;
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

  const maxPerDay = campaign.daily_limit ?? Infinity;
  const jobs = contacts.map((contact, index) => {
    const dayIndex = Math.floor(index / maxPerDay);
    const slotInDay = index % maxPerDay;

    const startDate = new Date(campaign.start_at);
    const scheduledAt = new Date(startDate);
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
      subject: '',
      body: '',
      scheduled_at: scheduledAt,
      status: 'SCHEDULED' as const,
      attempt_count: 0,
    };
  });

  await prisma.emailJob.createMany({ data: jobs });
}
