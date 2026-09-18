import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@/lib/generated/prisma/client';
import {
  reserveEmailCapacity,
  commitReservation,
  releaseReservation,
  recoverReservations,
} from '@/lib/limits/email-limit-service';

type Model = Record<string, ReturnType<typeof vi.fn>>;

function makeModel(defaults: Record<string, unknown> = {}): Model {
  const model: Model = {};
  for (const key of [
    'findUnique',
    'findFirst',
    'findMany',
    'create',
    'update',
    'upsert',
    'updateMany',
    'delete',
    'count',
  ]) {
    model[key] = vi.fn().mockResolvedValue(
      key === 'upsert' ? { sent_count: 0, reserved_count: 0 } : defaults[key] ?? null
    );
  }
  return model;
}

function createQuotaPrisma() {
  const systemSetting = makeModel({ findUnique: { email_sending_enabled: true, global_daily_email_limit: 500, default_daily_email_limit: 20 } });
  const user = makeModel({ findUnique: { id: 'user-1', is_active: true, daily_email_limit_override: null } });
  const emailUsageDaily = makeModel();
  const systemUsageDaily = makeModel();
  const campaignUsageDaily = makeModel();
  const emailSendReservation = makeModel();
  emailSendReservation.create.mockResolvedValue({ id: 'res-1' });
  const campaign = makeModel();

  const prisma = {
    systemSetting,
    user,
    emailUsageDaily,
    systemUsageDaily,
    campaignUsageDaily,
    emailSendReservation,
    campaign,
    $transaction: vi.fn(),
  } as unknown as PrismaClient & { $transaction: ReturnType<typeof vi.fn> };

  const tx = {
    systemSetting: { findUnique: systemSetting.findUnique },
    user: { findUnique: user.findUnique },
    campaign: { findUnique: campaign.findUnique },
    emailUsageDaily: { upsert: emailUsageDaily.upsert, update: emailUsageDaily.update },
    systemUsageDaily: { upsert: systemUsageDaily.upsert, update: systemUsageDaily.update },
    campaignUsageDaily: { upsert: campaignUsageDaily.upsert, update: campaignUsageDaily.update },
    emailSendReservation: {
      findFirst: emailSendReservation.findFirst,
      findMany: emailSendReservation.findMany,
      create: emailSendReservation.create,
      update: emailSendReservation.update,
    },
  };

  (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: (t: unknown) => Promise<unknown>, _opts?: unknown) => fn(tx)
  );

  return { prisma, models: { systemSetting, user, emailUsageDaily, systemUsageDaily, campaignUsageDaily, emailSendReservation, campaign } };
}

describe('lib/limits/email-limit-service (crash-safe)', () => {
  it('allows campaign reservations beyond the default five-second transaction deadline', async () => {
    const { prisma, models } = createQuotaPrisma();
    const transaction = vi.mocked(prisma.$transaction);
    const runTransaction = transaction.getMockImplementation()!;
    transaction.mockImplementation(async (callback, options) => {
      // Model six seconds of database round trips, as observed with Neon.
      if ((options?.timeout ?? 5_000) < 6_000) {
        throw Object.assign(new Error('Transaction expired'), { code: 'P2028' });
      }
      return runTransaction(callback, options);
    });
    const result = await reserveEmailCapacity(prisma, {
      userId: 'user-1', emailJobId: 'job-1', campaignId: 'campaign-1',
    });
    expect(result.success).toBe(true);
    expect(models.campaignUsageDaily.upsert).toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
  });

  it('reserves capacity and increments reserved counters', async () => {
    const { prisma, models } = createQuotaPrisma();
    const result = await reserveEmailCapacity(prisma, { userId: 'user-1', emailJobId: 'job-1' });

    expect(result.success).toBe(true);
    expect(models.emailSendReservation.create).toHaveBeenCalled();
    expect(models.emailUsageDaily.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reserved_count: { increment: 1 } } })
    );
    expect(models.systemUsageDaily.upsert).toHaveBeenCalled();
  });

  it('is idempotent for the same job + attempt number', async () => {
    const { prisma, models } = createQuotaPrisma();
    models.emailSendReservation.findFirst.mockResolvedValue({ id: 'res-1', status: 'RESERVED' });
    const result = await reserveEmailCapacity(prisma, { userId: 'user-1', emailJobId: 'job-1', attemptNumber: 1 });

    expect(result.success).toBe(true);
    expect(result.reservationId).toBe('res-1');
    expect(models.emailSendReservation.create).not.toHaveBeenCalled();
  });

  it('allocates a fresh reservation after manual retry resets the job attempt count', async () => {
    const { prisma, models } = createQuotaPrisma();
    models.emailSendReservation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ attempt_number: 3 });
    const result = await reserveEmailCapacity(prisma, { userId: 'user-1', emailJobId: 'job-1', attemptNumber: 1 });
    expect(result.success).toBe(true);
    expect(models.emailSendReservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email_job_id: 'job-1', attempt_number: 4, status: 'RESERVED' }),
    });
  });

  it('reuses an outstanding reservation whose sequence differs from the reset job attempt', async () => {
    const { prisma, models } = createQuotaPrisma();
    models.emailSendReservation.findFirst.mockResolvedValue({ id: 'res-4', attempt_number: 4, status: 'RESERVED' });
    const result = await reserveEmailCapacity(prisma, { userId: 'user-1', emailJobId: 'job-1', attemptNumber: 1 });
    expect(result.reservationId).toBe('res-4');
    expect(models.emailSendReservation.findFirst).toHaveBeenCalledWith({
      where: { email_job_id: 'job-1', status: 'RESERVED' },
    });
    expect(models.emailSendReservation.create).not.toHaveBeenCalled();
    expect(models.emailUsageDaily.update).not.toHaveBeenCalled();
  });

  it('fails when email sending is disabled', async () => {
    const { prisma, models } = createQuotaPrisma();
    models.systemSetting.findUnique.mockResolvedValue({ email_sending_enabled: false });
    const result = await reserveEmailCapacity(prisma, { userId: 'user-1', emailJobId: 'job-1' });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('Email sending is currently disabled.');
  });

  it('fails when the account daily limit is reached', async () => {
    const { prisma, models } = createQuotaPrisma();
    models.emailUsageDaily.upsert.mockResolvedValue({ sent_count: 500, reserved_count: 0 });
    const result = await reserveEmailCapacity(prisma, { userId: 'user-1', emailJobId: 'job-1' });
    expect(result.success).toBe(false);
    expect(result.reason).toContain('[ACCOUNT_DAILY_LIMIT]');
  });

  it('commits a reservation, moving it from reserved to sent', async () => {
    const { prisma, models } = createQuotaPrisma();
    models.emailSendReservation.findFirst.mockResolvedValue({ id: 'res-1', status: 'RESERVED', resolved_at: null });
    await commitReservation(prisma, { userId: 'user-1', emailJobId: 'job-1' });

    expect(models.emailSendReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMMITTED' }) })
    );
    expect(models.emailUsageDaily.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reserved_count: { decrement: 1 }, sent_count: { increment: 1 } }),
      })
    );
  });

  it('releases outstanding reservations and decrements reserved counters', async () => {
    const { prisma, models } = createQuotaPrisma();
    models.emailSendReservation.findMany.mockResolvedValue([{ id: 'res-1', status: 'RESERVED', resolved_at: null }]);
    const released = await releaseReservation(prisma, { userId: 'user-1', emailJobId: 'job-1' });
    expect(released).toBe(1);
    expect(models.emailSendReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RELEASED' }) })
    );
    expect(models.emailUsageDaily.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reserved_count: { decrement: 1 } }) })
    );
  });

  it('recovers leaked reservations past the stuck threshold', async () => {
    const { prisma, models } = createQuotaPrisma();
    models.emailSendReservation.findMany.mockResolvedValue([
      {
        id: 'res-1',
        user_id: 'user-1',
        campaign_id: null,
        usage_date: new Date('2024-01-01T00:00:00Z'),
        status: 'RESERVED',
        email_job: { user_id: 'user-1', campaign_id: null, status: 'DELIVERY_UNKNOWN' },
      },
    ]);
    const result = await recoverReservations(prisma, { stuckMinutes: 15 });
    expect(result.reconciled).toBe(1);
    expect(models.emailSendReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'UNKNOWN' }) })
    );
    expect(models.emailUsageDaily.update).not.toHaveBeenCalled();
  });
});
