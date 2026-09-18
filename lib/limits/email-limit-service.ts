import { PrismaClient } from '../generated/prisma/client';
import { NotFoundError, AppError } from '../errors';
import { LIMIT_ERROR_CODES, TRANSIENT_ERROR_CODES } from './error-codes';

type Tx = PrismaClient;

const RESERVATION_MAX_ATTEMPTS = 3;
const HARDCODED_GLOBAL_FALLBACK = 500;
const HARDCODED_DEFAULT_FALLBACK = 20;

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
  const globalLimit = settings?.global_daily_email_limit ?? 500;
  const defaultLimit = settings?.default_daily_email_limit ?? 20;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { daily_email_limit_override: true },
  });
  const userLimit = user?.daily_email_limit_override ?? defaultLimit;

  let effectiveLimit = Math.min(globalLimit, userLimit);

  if (campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { daily_limit: true },
    });
    if (campaign?.daily_limit !== null && campaign?.daily_limit !== undefined) {
      effectiveLimit = Math.min(effectiveLimit, campaign.daily_limit);
    }
  }

  return effectiveLimit;
}

export interface DailyUsageSummary {
  sent: number;
  reserved: number;
  limit: number;
  remaining: number;
  limitingScope: 'SYSTEM' | 'ACCOUNT';
  limitingLimit: number;
}

export async function getUserDailyUsage(
  prisma: PrismaClient,
  userId: string
): Promise<DailyUsageSummary> {
  const today = utcToday();
  const [usage, settings, user] = await Promise.all([
    prisma.emailUsageDaily.findUnique({
      where: { user_id_usage_date: { user_id: userId, usage_date: today } },
      select: { sent_count: true, reserved_count: true },
    }),
    prisma.systemSetting.findUnique({ where: { id: 1 } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { daily_email_limit_override: true },
    }),
  ]);

  const globalLimit = settings?.global_daily_email_limit ?? 500;
  const defaultLimit = settings?.default_daily_email_limit ?? 20;
  const userLimit = user?.daily_email_limit_override ?? defaultLimit;
  const effectiveLimit = Math.min(globalLimit, userLimit);

  const sent = usage?.sent_count ?? 0;
  const reserved = usage?.reserved_count ?? 0;
  const limitingScope: 'SYSTEM' | 'ACCOUNT' = globalLimit <= userLimit ? 'SYSTEM' : 'ACCOUNT';
  const limitingLimit = limitingScope === 'SYSTEM' ? globalLimit : userLimit;

  return { sent, reserved, limit: effectiveLimit, remaining: Math.max(0, effectiveLimit - sent - reserved), limitingScope, limitingLimit };
}

export interface CampaignDailyUsage {
  sent: number;
  reserved: number;
  limit: number;
  configuredLimit: number | null;
  limitingScope: 'SYSTEM' | 'ACCOUNT' | null;
  limitingLimit: number | null;
}

export async function getCampaignDailyUsage(
  prisma: PrismaClient,
  campaignId: string
): Promise<CampaignDailyUsage> {
  const today = utcToday();
  const [usage, campaign] = await Promise.all([
    prisma.campaignUsageDaily.findUnique({
      where: { campaign_id_usage_date: { campaign_id: campaignId, usage_date: today } },
      select: { sent_count: true, reserved_count: true },
    }),
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { daily_limit: true, user_id: true },
    }),
  ]);

  const sent = usage?.sent_count ?? 0;
  const reserved = usage?.reserved_count ?? 0;
  const configuredLimit = campaign?.daily_limit ?? null;

  if (!campaign) {
    return { sent, reserved, limit: 0, configuredLimit: null, limitingScope: null, limitingLimit: null };
  }

  const settings = await prisma.systemSetting.findUnique({ where: { id: 1 } });
  const globalLimit = settings?.global_daily_email_limit ?? HARDCODED_GLOBAL_FALLBACK;
  const defaultLimit = settings?.default_daily_email_limit ?? HARDCODED_DEFAULT_FALLBACK;

  const user = await prisma.user.findUnique({
    where: { id: campaign.user_id },
    select: { daily_email_limit_override: true },
  });
  const userLimit = user?.daily_email_limit_override ?? defaultLimit;

  const campaignLimit = configuredLimit;
  const effective = campaignLimit !== null
    ? Math.min(globalLimit, userLimit, campaignLimit)
    : Math.min(globalLimit, userLimit);

  let limitingScope: 'SYSTEM' | 'ACCOUNT' | null = null;
  let limitingLimit: number | null = null;

  if (campaignLimit !== null && effective < campaignLimit) {
    if (effective === userLimit) {
      limitingScope = 'ACCOUNT';
      limitingLimit = userLimit;
    } else {
      limitingScope = 'SYSTEM';
      limitingLimit = globalLimit;
    }
  }

  return { sent, reserved, limit: effective, configuredLimit, limitingScope, limitingLimit };
}

export async function getSystemDailyUsage(
  prisma: PrismaClient
): Promise<{ sent: number; reserved: number; limit: number }> {
  const today = utcToday();
  const [usage, settings] = await Promise.all([
    prisma.systemUsageDaily.findUnique({
      where: { usage_date: today },
      select: { sent_count: true, reserved_count: true },
    }),
    prisma.systemSetting.findUnique({ where: { id: 1 } }),
  ]);
  return {
    sent: usage?.sent_count ?? 0,
    reserved: usage?.reserved_count ?? 0,
    limit: settings?.global_daily_email_limit ?? 500,
  };
}

/**
 * Reserves one send for the given job attempt. All quota checks and the
 * per-day counter increments happen inside a single transaction. The
 * reservation is keyed by `(email_job_id, attempt_number)` so a retried job
 * (new attempt number) creates a fresh reservation while a re-driven identical
 * attempt is idempotent (reuses the existing reservation, no double count).
 *
 * Three independent checks run inside a Serializable transaction:
 *   1. System  — systemUsageDaily vs global_daily_email_limit
 *   2. Account — emailUsageDaily  vs user override ?? default_daily_email_limit
 *   3. Campaign — campaignUsageDaily vs campaign.daily_limit (if set)
 *
 * A bounded retry loop (RESERVATION_MAX_ATTEMPTS = 3) handles P2034
 * serialization conflicts. If all attempts fail, the function returns
 * a transient error reason so the consumer can set the job to QUEUED
 * (never SCHEDULED or RETRY_WAIT) for scheduler-driven retry.
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

  for (let attempt = 1; attempt <= RESERVATION_MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const t = tx as Tx;
          const today = utcToday();

          const settings = await t.systemSetting.findUnique({ where: { id: 1 } });
          if (!settings || !settings.email_sending_enabled) {
            return { success: false, reason: 'Email sending is currently disabled.' };
          }

          const user = await t.user.findUnique({
            where: { id: params.userId },
            select: { is_active: true, daily_email_limit_override: true },
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

          const globalLimit = settings.global_daily_email_limit ?? HARDCODED_GLOBAL_FALLBACK;
          const defaultLimit = settings.default_daily_email_limit ?? HARDCODED_DEFAULT_FALLBACK;
          const userLimit = user.daily_email_limit_override ?? defaultLimit;

          let campaignLimit: number | null = null;
          if (params.campaignId) {
            const campaign = await t.campaign.findUnique({
              where: { id: params.campaignId },
              select: { daily_limit: true },
            });
            if (campaign?.daily_limit !== null && campaign?.daily_limit !== undefined) {
              campaignLimit = campaign.daily_limit;
            }
          }

          const systemUsage = await t.systemUsageDaily.upsert({
            where: { usage_date: today },
            update: {},
            create: { usage_date: today, reserved_count: 0, sent_count: 0 },
          });
          if (systemUsage.sent_count + systemUsage.reserved_count >= globalLimit) {
            return {
              success: false,
              reason: `${LIMIT_ERROR_CODES.SYSTEM} System daily limit reached (${systemUsage.sent_count + systemUsage.reserved_count} of ${globalLimit}). Try again tomorrow.`,
            };
          }

          const userUsage = await t.emailUsageDaily.upsert({
            where: { user_id_usage_date: { user_id: params.userId, usage_date: today } },
            update: {},
            create: { user_id: params.userId, usage_date: today },
          });
          if (userUsage.sent_count + userUsage.reserved_count >= userLimit) {
            return {
              success: false,
              reason: `${LIMIT_ERROR_CODES.ACCOUNT} Account daily limit reached (${userUsage.sent_count + userUsage.reserved_count} of ${userLimit}). Resets at midnight UTC.`,
            };
          }

          if (campaignLimit !== null) {
            const campaignUsage = await t.campaignUsageDaily.upsert({
              where: { campaign_id_usage_date: { campaign_id: params.campaignId!, usage_date: today } },
              update: {},
              create: { campaign_id: params.campaignId!, usage_date: today, reserved_count: 0, sent_count: 0 },
            });
            if (campaignUsage.sent_count + campaignUsage.reserved_count >= campaignLimit) {
              return {
                success: false,
                reason: `${LIMIT_ERROR_CODES.CAMPAIGN} Campaign daily limit reached (${campaignUsage.sent_count + campaignUsage.reserved_count} of ${campaignLimit}). Resets at midnight UTC.`,
              };
            }
          }

          await t.emailUsageDaily.update({
            where: { user_id_usage_date: { user_id: params.userId, usage_date: today } },
            data: { reserved_count: { increment: 1 } },
          });

          await t.systemUsageDaily.update({
            where: { usage_date: today },
            data: { reserved_count: { increment: 1 } },
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
        },
        { isolationLevel: 'Serializable' }
      );
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'P2034' && attempt < RESERVATION_MAX_ATTEMPTS) continue;
      if (code === 'P2034') {
        return {
          success: false,
          reason: `${TRANSIENT_ERROR_CODES.QUOTA_CONFLICT} Could not reserve email capacity after ${RESERVATION_MAX_ATTEMPTS} attempts due to concurrent modifications. Job will be retried by the scheduler.`,
        };
      }
      throw error;
    }
  }

  return {
    success: false,
    reason: `${TRANSIENT_ERROR_CODES.QUOTA_CONFLICT} Could not reserve email capacity after ${RESERVATION_MAX_ATTEMPTS} attempts.`,
  };
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
    const terminal = ['SENT', 'FAILED', 'CANCELLED'].includes(
      r.email_job?.status ?? ''
    );
    const nextStatus: 'RELEASED' | 'UNKNOWN' = terminal ? 'RELEASED' : 'UNKNOWN';

    await prisma.emailSendReservation.update({
      where: { id: r.id },
      data: { status: nextStatus, resolved_at: new Date() },
    });

    // UNKNOWN preserves the reservation and counters for admin review. It is
    // deliberately not treated as released capacity.
    if (!terminal) {
      reconciled += 1;
      continue;
    }

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

/**
 * Admin recovery for a job stuck in `DELIVERY_UNKNOWN` (its upstream send
 * ended without a definitive success/failure acknowledgement). The decision is
 * applied atomically inside a single transaction:
 *   - `sent`   : mark the job SENT and COMMIT the outstanding reservation
 *               (reservation -> COMMITTED, reserved_count--, sent_count++).
 *   - `failed` : mark the job FAILED and RELEASE the outstanding reservation
 *               (reservation -> RELEASED, reserved_count--).
 *   - `unknown` : no-op; the job stays DELIVERY_UNKNOWN for later review.
 *
 * Only jobs currently in `DELIVERY_UNKNOWN` may be resolved this way.
 */
export async function resolveDeliveryUnknown(
  prisma: PrismaClient,
  params: {
    emailJobId: string;
    userId: string;
    campaignId?: string | null;
    decision: 'sent' | 'failed' | 'unknown';
  }
): Promise<'sent' | 'failed' | 'unknown'> {
  if (params.decision === 'unknown') {
    return 'unknown';
  }

  return prisma.$transaction(async (tx) => {
    const t = tx as Tx;
    const today = utcToday();

    const job = await t.emailJob.findUnique({ where: { id: params.emailJobId } });
    if (!job) {
      throw new NotFoundError('Email job not found.');
    }
    if (job.status !== 'DELIVERY_UNKNOWN') {
      throw new AppError(
        'Only jobs in DELIVERY_UNKNOWN can be recovered.',
        409,
        'BUSINESS_ERROR'
      );
    }

    const reservation = await t.emailSendReservation.findFirst({
      where: { email_job_id: params.emailJobId, status: { in: ['RESERVED', 'UNKNOWN'] } },
      orderBy: { attempt_number: 'desc' },
    });

    const reconcileCounters = async (mode: 'commit' | 'release') => {
      if (!reservation || reservation.resolved_at) {
        // No outstanding reservation to reconcile; still advance the sent
        // counter for a commit so totals stay correct.
        if (mode === 'commit') {
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
        }
        return;
      }

      const usageDate = reservation.usage_date;
      if (mode === 'commit') {
        await t.emailSendReservation.update({
          where: { id: reservation.id },
          data: { status: 'COMMITTED', resolved_at: new Date() },
        });
        await t.emailUsageDaily.update({
          where: { user_id_usage_date: { user_id: params.userId, usage_date: usageDate } },
          data: { reserved_count: { decrement: 1 }, sent_count: { increment: 1 } },
        });
        await t.systemUsageDaily.update({
          where: { usage_date: usageDate },
          data: { reserved_count: { decrement: 1 }, sent_count: { increment: 1 } },
        });
        if (params.campaignId) {
          await t.campaignUsageDaily.update({
            where: { campaign_id_usage_date: { campaign_id: params.campaignId, usage_date: usageDate } },
            data: { reserved_count: { decrement: 1 }, sent_count: { increment: 1 } },
          });
        }
      } else {
        await t.emailSendReservation.update({
          where: { id: reservation.id },
          data: { status: 'RELEASED', resolved_at: new Date() },
        });
        await t.emailUsageDaily.update({
          where: { user_id_usage_date: { user_id: params.userId, usage_date: usageDate } },
          data: { reserved_count: { decrement: 1 } },
        });
        await t.systemUsageDaily.update({
          where: { usage_date: usageDate },
          data: { reserved_count: { decrement: 1 } },
        });
        if (params.campaignId) {
          await t.campaignUsageDaily.update({
            where: { campaign_id_usage_date: { campaign_id: params.campaignId, usage_date: usageDate } },
            data: { reserved_count: { decrement: 1 } },
          });
        }
      }
    };

    if (params.decision === 'sent') {
      await t.emailJob.update({
        where: { id: params.emailJobId },
        data: { status: 'SENT', sent_at: new Date() },
      });
      await reconcileCounters('commit');
      return 'sent';
    }

    await t.emailJob.update({
      where: { id: params.emailJobId },
      data: { status: 'FAILED' },
    });
    await reconcileCounters('release');
    return 'failed';
  });
}
