import { PrismaClient } from '../generated/prisma/client';

export async function generateCampaignJobs(
  prisma: PrismaClient,
  campaign: {
    user_id: string;
    start_at: Date;
    interval_minutes: number;
    email_account_id: string;
    resume_id: string;
    template_id: string;
  },
  contactIds: string[]
): Promise<void> {
  const contacts = await prisma.contact.findMany({
    where: { id: { in: contactIds }, user_id: campaign.user_id },
  });

  const jobs = contacts.map((contact: { id: string }, index: number) => {
    const dayOffset = Math.floor(index / campaign.interval_minutes);
    const minuteOfDay = (index % campaign.interval_minutes) * campaign.interval_minutes;
    const startDate = new Date(campaign.start_at);
    const scheduledAt = new Date(startDate);
    scheduledAt.setUTCDate(scheduledAt.getUTCDate() + dayOffset);
    scheduledAt.setUTCHours(0, 0, minuteOfDay, 0);

    return {
      user_id: campaign.user_id,
      campaign_id: '',
      contact_id: contact.id,
      email_account_id: campaign.email_account_id,
      resume_id: campaign.resume_id,
      template_id: campaign.template_id,
      to_email: '',
      subject: '',
      body: '',
      scheduled_at: scheduledAt,
      status: 'SCHEDULED' as const,
      attempt_count: 0,
    };
  });

  await prisma.emailJob.createMany({ data: jobs });
}
