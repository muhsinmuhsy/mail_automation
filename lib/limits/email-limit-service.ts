import { PrismaClient } from '../generated/prisma/client';

export async function getEffectiveDailyEmailLimit(
  prisma: PrismaClient,
  userId: string,
  campaignId?: string | null
): Promise<number> {
  const settings = await prisma.systemSetting.findUnique({ where: { id: 1 } });
  if (!settings) {
    return 20;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { daily_email_limit_override: true },
  });

  let effectiveLimit = settings.global_daily_email_limit;

  if (user?.daily_email_limit_override && user.daily_email_limit_override > 0) {
    effectiveLimit = Math.min(effectiveLimit, user.daily_email_limit_override);
  }

  if (campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { daily_limit: true },
    });
    if (campaign?.daily_limit && campaign.daily_limit > 0) {
      effectiveLimit = Math.min(effectiveLimit, campaign.daily_limit);
    }
  }

  return effectiveLimit;
}

export async function reserveEmailCapacity(
  prisma: PrismaClient,
  params: { userId: string; campaignId?: string | null; emailJobId: string }
): Promise<{ success: boolean; reason?: string }> {
  const { userId, campaignId, emailJobId } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.$transaction(async (tx: any) => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const settings = await tx.systemSetting.findUnique({ where: { id: 1 } });
    if (!settings || !settings.email_sending_enabled) {
      return { success: false, reason: 'Email sending is currently disabled.' };
    }

    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || !user.is_active) {
      return { success: false, reason: 'User account is inactive.' };
    }

    const userUsage = await tx.emailUsageDaily.upsert({
      where: { user_id_usage_date: { user_id: userId, usage_date: today } },
      update: {},
      create: { user_id: userId, usage_date: today, sent_count: 0, reserved_count: 0 },
    });

    const effectiveLimit = await getEffectiveDailyEmailLimit(prisma, userId, campaignId);
    const availableCapacity = effectiveLimit - userUsage.sent_count - userUsage.reserved_count;

    if (availableCapacity <= 0) {
      return { success: false, reason: 'Daily email limit reached.' };
    }

    await tx.emailUsageDaily.update({
      where: { user_id_usage_date: { user_id: userId, usage_date: today } },
      data: { reserved_count: { increment: 1 } },
    });

    await tx.systemUsageDaily.upsert({
      where: { usage_date: today },
      update: { reserved_count: { increment: 1 } },
      create: { usage_date: today, sent_count: 0, reserved_count: 1 },
    });

    if (campaignId) {
      await tx.campaignUsageDaily.upsert({
        where: { campaign_id_usage_date: { campaign_id: campaignId, usage_date: today } },
        update: {},
        create: { campaign_id: campaignId, usage_date: today, sent_count: 0, reserved_count: 0 },
      });

      await tx.campaignUsageDaily.update({
        where: { campaign_id_usage_date: { campaign_id: campaignId, usage_date: today } },
        data: { reserved_count: { increment: 1 } },
      });
    }

    await tx.emailSendReservation.create({
      data: {
        email_job_id: emailJobId,
        attempt_number: 1,
        user_id: userId,
        campaign_id: campaignId ?? undefined,
        usage_date: today,
        status: 'RESERVED',
      },
    });

    return { success: true };
  });
}
