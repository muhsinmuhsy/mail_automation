import { PrismaClient } from '../generated/prisma/client';

type Tx = PrismaClient;

function utcToday(d: Date = new Date()): Date {
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

export type ReservationResult = {
  success: boolean;
  reason?: string;
  reservationId?: string;
};

export async function getEffectiveDailyEmailLimit(
  prisma: PrismaClient,
  userId: string,
  campaignId?: string | null
): Promise<number> {
  const settings = await prisma.systemSetting.findUnique({ where: { id: 1 } });
  if (!settings) {
    return 20;
  }

  let effectiveLimit = settings.global_daily_email_limit;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { daily_email_limit_override: true },
  });
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

async function computeLimit(tx: Tx, userId: string, campaignId?: string | null): Promise<number> {
  return getEffectiveDailyEmailLimit(tx as PrismaClient, userId, campaignId);
}

/**
 * Reserves one send for the given job attempt. All quota checks and the
 * per-day counter increments happen inside a single transaction. The
 * reservation is keyed by `(email_job_id, attempt_number)` so a retried job
 * (new attempt number) creates a fresh reservation while a re-driven identical
 * attempt is idempotent (reuses the existing reservation, no double count).
 */
export async function reserveEmailCapacity(
  prisma: PrismaClient,
  params: {
    userId: string;
    campaignId?: string | null;
    emailJobId: string;
    attemptNumber?: number;
  }
): Promise<ReservationResult> {
  const attemptNumber = params.attemptNumber ?? 1;

  return prisma.$transaction(async (tx) => {
    const t = tx as Tx;
    const today = utcToday();

    const settings = await t.systemSetting.findUnique({ where: { id: 1 } });
    if (!settings || !settings.email_sending_enabled) {
      return { success: false, reason: 'Email sending is currently disabled.' };
    }

    const user = await t.user.findUnique({
      where: { id: params.userId },
      select: { is_active: true },
    });
    if (!user || !user.is_active) {
      return { success: false, reason: 'User account is inactive.' };
    }

    const existing = await t.emailSendReservation.findFirst({
      where: { email_job_id: params.emailJobId, attempt_number: attemptNumber, status: 'RESERVED' },
    });
    if (existing) {
      return { success: true, reservationId: existing.id };
    }

    const effectiveLimit = await computeLimit(t, params.userId, params.campaignId);
    const usage = await t.emailUsageDaily.upsert({
      where: { user_id_usage_date: { user_id: params.userId, usage_date: today } },
      update: {},
      create: { user_id: params.userId, usage_date: today },
    });

    const available = effectiveLimit - usage.sent_count - usage.reserved_count;
    if (available <= 0) {
      return { success: false, reason: 'Daily email limit reached.' };
    }

    await t.emailUsageDaily.update({
      where: { user_id_usage_date: { user_id: params.userId, usage_date: today } },
      data: { reserved_count: { increment: 1 } },
    });

    await t.systemUsageDaily.upsert({
      where: { usage_date: today },
      update: { reserved_count: { increment: 1 } },
      create: { usage_date: today, reserved_count: 1, sent_count: 0 },
    });

    if (params.campaignId) {
      await t.campaignUsageDaily.upsert({
        where: { campaign_id_usage_date: { campaign_id: params.campaignId, usage_date: today } },
        update: { reserved_count: { increment: 1 } },
        create: { campaign_id: params.campaignId, usage_date: today, reserved_count: 1, sent_count: 0 },
      });
    }

    const reservation = await t.emailSendReservation.create({
      data: {
        email_job_id: params.emailJobId,
        attempt_number: attemptNumber,
        user_id: params.userId,
        campaign_id: params.campaignId ?? null,
        usage_date: today,
        status: 'RESERVED',
      },
    });

    return { success: true, reservationId: reservation.id };
  });
}

/**
 * Marks the latest outstanding reservation COMMITTED and moves it from
 * `reserved_count` to `sent_count`. Idempotent for an already-committed job.
 */
export async function commitReservation(
  prisma: PrismaClient,
  params: { userId: string; campaignId?: string | null; emailJobId: string }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const t = tx as Tx;
    const today = utcToday();

    const reservation = await t.emailSendReservation.findFirst({
      where: { email_job_id: params.emailJobId, status: 'RESERVED' },
      orderBy: { attempt_number: 'desc' },
    });

    if (reservation && !reservation.resolved_at) {
      await t.emailSendReservation.update({
        where: { id: reservation.id },
        data: { status: 'COMMITTED', resolved_at: new Date() },
      });
      await t.emailUsageDaily.update({
        where: { user_id_usage_date: { user_id: params.userId, usage_date: today } },
        data: { reserved_count: { decrement: 1 }, sent_count: { increment: 1 } },
      });
      await t.systemUsageDaily.update({
        where: { usage_date: today },
        data: { reserved_count: { decrement: 1 }, sent_count: { increment: 1 } },
      });
      if (params.campaignId) {
        await t.campaignUsageDaily.update({
          where: { campaign_id_usage_date: { campaign_id: params.campaignId, usage_date: today } },
          data: { reserved_count: { decrement: 1 }, sent_count: { increment: 1 } },
        });
      }
      return;
    }

    // No outstanding reservation: ensure the sent counter is still advanced.
    await t.emailUsageDaily.upsert({
      where: { user_id_usage_date: { user_id: params.userId, usage_date: today } },
      update: { sent_count: { increment: 1 } },
      create: { user_id: params.userId, usage_date: today, sent_count: 1 },
    });
    await t.systemUsageDaily.upsert({
      where: { usage_date: today },
      update: { sent_count: { increment: 1 } },
      create: { usage_date: today, sent_count: 1 },
    });
    if (params.campaignId) {
      await t.campaignUsageDaily.upsert({
        where: { campaign_id_usage_date: { campaign_id: params.campaignId, usage_date: today } },
        update: { sent_count: { increment: 1 } },
        create: { campaign_id: params.campaignId, usage_date: today, sent_count: 1 },
      });
    }
  });
}

/**
 * Releases every RESERVED reservation for a job and decrements the per-day
 * `reserved_count` counters accordingly. Returns the number of reservations
 * actually released.
 */
export async function releaseReservation(
  prisma: PrismaClient,
  params: { userId: string; campaignId?: string | null; emailJobId: string; reason?: string }
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const t = tx as Tx;
    const today = utcToday();

    const reservations = await t.emailSendReservation.findMany({
      where: { email_job_id: params.emailJobId, status: 'RESERVED' },
    });

    let released = 0;
    for (const r of reservations) {
      if (r.resolved_at) continue;
      await t.emailSendReservation.update({
        where: { id: r.id },
        data: { status: 'RELEASED', resolved_at: new Date() },
      });
      released += 1;
    }

    if (released === 0) return 0;

    await t.emailUsageDaily.update({
      where: { user_id_usage_date: { user_id: params.userId, usage_date: today } },
      data: { reserved_count: { decrement: released } },
    });
    await t.systemUsageDaily.update({
      where: { usage_date: today },
      data: { reserved_count: { decrement: released } },
    });
    if (params.campaignId) {
      await t.campaignUsageDaily.update({
        where: { campaign_id_usage_date: { campaign_id: params.campaignId, usage_date: today } },
        data: { reserved_count: { decrement: released } },
      });
    }
    return released;
  });
}

/**
 * Crash recovery: reservations left RESERVED past `stuckMinutes` (e.g. a worker
 * that died mid-send) are reconciled so they no longer inflate `reserved_count`.
 * Terminal-state jobs release their reservation; otherwise it is marked UNKNOWN.
 */
export async function recoverReservations(
  prisma: PrismaClient,
  opts: { stuckMinutes?: number } = {}
): Promise<{ reconciled: number }> {
  const threshold = new Date(Date.now() - (opts.stuckMinutes ?? 15) * 60_000);

  const leaked = await prisma.emailSendReservation.findMany({
    where: { status: 'RESERVED', created_at: { lt: threshold } },
    include: { email_job: { select: { user_id: true, campaign_id: true, status: true } } },
  });

  let reconciled = 0;
  for (const r of leaked) {
    const terminal = ['SENT', 'FAILED', 'CANCELLED', 'DELIVERY_UNKNOWN'].includes(
      r.email_job?.status ?? ''
    );
    const nextStatus: 'RELEASED' | 'UNKNOWN' = terminal ? 'RELEASED' : 'UNKNOWN';

    await prisma.emailSendReservation.update({
      where: { id: r.id },
      data: { status: nextStatus, resolved_at: new Date() },
    });

    await prisma.emailUsageDaily.update({
      where: {
        user_id_usage_date: { user_id: r.user_id, usage_date: r.usage_date },
      },
      data: { reserved_count: { decrement: 1 } },
    });
    await prisma.systemUsageDaily.update({
      where: { usage_date: r.usage_date },
      data: { reserved_count: { decrement: 1 } },
    });
    if (r.campaign_id) {
      await prisma.campaignUsageDaily.update({
        where: {
          campaign_id_usage_date: { campaign_id: r.campaign_id, usage_date: r.usage_date },
        },
        data: { reserved_count: { decrement: 1 } },
      });
    }
    reconciled += 1;
  }

  return { reconciled };
}
