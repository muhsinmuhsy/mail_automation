import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@/lib/generated/prisma/client';
import {
  getEffectiveDailyEmailLimit,
  reserveEmailCapacity,
  commitReservation,
  releaseReservation,
  recoverReservations,
  resolveDeliveryUnknown,
} from '@/lib/limits/email-limit-service';

type Fn = ReturnType<typeof vi.fn>;


function makeModel(dflt: Record<string, any> = {}) {
  const m: Record<string, Fn> = {};
  for (const k of [
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
    m[k] = vi.fn().mockResolvedValue(k === 'upsert' ? { sent_count: 0, reserved_count: 0 } : (dflt[k] ?? null));
  }
  return m as Record<string, Fn>;
}

interface LimitOpts {
  campaignDailyLimit?: number | null;
}

function makeLimitPrisma(opts: LimitOpts = {}) {
  const systemSetting = makeModel({ findUnique: { email_sending_enabled: true, global_daily_email_limit: 500, default_daily_email_limit: 20 } });
  const user = makeModel({ findUnique: { id: 'user-1', is_active: true, daily_email_limit_override: null } });
  const emailUsageDaily = makeModel();
  const systemUsageDaily = makeModel();
  const campaignUsageDaily = makeModel();
  const emailSendReservation = makeModel();
  emailSendReservation.create.mockResolvedValue({ id: 'res-1' });
  const campaign = makeModel({ findUnique: { daily_limit: opts.campaignDailyLimit ?? null } });
  const emailJob = makeModel();

  const prisma = {
    systemSetting,
    user,
    emailUsageDaily,
    systemUsageDaily,
    campaignUsageDaily,
    emailSendReservation,
    campaign,
    emailJob,
    $transaction: vi.fn(),

  } as any as PrismaClient & { $transaction: Fn };

  const tx = {
    systemSetting: { findUnique: systemSetting.findUnique },
    user: { findUnique: user.findUnique },
    campaign: { findUnique: campaign.findUnique },
    emailJob: { findUnique: emailJob.findUnique, update: emailJob.update },
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


  (prisma.$transaction as Fn).mockImplementation(async (fn: (t: any) => Promise<any>, _opts?: any) => fn(tx));

  return {
    prisma,
    models: { systemSetting, user, emailUsageDaily, systemUsageDaily, campaignUsageDaily, emailSendReservation, campaign, emailJob },
  };
}

describe('lib/limits/email-limit-service additional coverage', () => {
  describe('getEffectiveDailyEmailLimit', () => {
    it('uses the default limit when the user override is NULL', async () => {
      const { prisma, models } = makeLimitPrisma();
      models.user.findUnique.mockResolvedValue({ daily_email_limit_override: null });
      models.campaign.findUnique.mockResolvedValue(null);
      expect(await getEffectiveDailyEmailLimit(prisma, 'user-1')).toBe(20);
    });

    it('treats user override 0 as an active zero limit', async () => {
      const { prisma, models } = makeLimitPrisma();
      models.user.findUnique.mockResolvedValue({ daily_email_limit_override: 0 });
      models.campaign.findUnique.mockResolvedValue(null);
      expect(await getEffectiveDailyEmailLimit(prisma, 'user-1')).toBe(0);
    });

    it('uses the default limit when the campaign limit is NULL', async () => {
      const { prisma, models } = makeLimitPrisma();
      models.user.findUnique.mockResolvedValue(null);
      models.campaign.findUnique.mockResolvedValue({ daily_limit: null });
      expect(await getEffectiveDailyEmailLimit(prisma, 'user-1', 'camp-1')).toBe(20);
    });

    it('uses the default limit when the user is not found', async () => {
      const { prisma, models } = makeLimitPrisma();
      models.user.findUnique.mockResolvedValue(null);
      models.campaign.findUnique.mockResolvedValue(null);
      expect(await getEffectiveDailyEmailLimit(prisma, 'missing')).toBe(20);
    });

    it('returns the min of global, user override, and campaign limit', async () => {
      const { prisma, models } = makeLimitPrisma({ campaignDailyLimit: 50 });
      models.user.findUnique.mockResolvedValue({ daily_email_limit_override: 100 });
      models.campaign.findUnique.mockResolvedValue({ daily_limit: 50 });
      expect(await getEffectiveDailyEmailLimit(prisma, 'user-1', 'camp-1')).toBe(50);
    });
  });

  describe('reserveEmailCapacity', () => {
    it('reserves with a campaign present and increments campaign counters', async () => {
      const { prisma, models } = makeLimitPrisma();
      const result = await reserveEmailCapacity(prisma, {
        userId: 'user-1',
        campaignId: 'camp-1',
        emailJobId: 'job-1',
      });
      expect(result.success).toBe(true);
      expect(models.emailSendReservation.create).toHaveBeenCalled();
      expect(models.campaignUsageDaily.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ reserved_count: 1 }) })
      );
    });

    it('skips campaign counters when campaignId is NULL', async () => {
      const { prisma, models } = makeLimitPrisma();
      const result = await reserveEmailCapacity(prisma, { userId: 'user-1', emailJobId: 'job-1' });
      expect(result.success).toBe(true);
      expect(models.campaignUsageDaily.upsert).not.toHaveBeenCalled();
    });

    it('fails at the account level when the user daily limit is exceeded', async () => {
      const { prisma, models } = makeLimitPrisma({ campaignDailyLimit: 50 });
      models.emailUsageDaily.upsert.mockResolvedValue({ sent_count: 50, reserved_count: 0 });
      const result = await reserveEmailCapacity(prisma, {
        userId: 'user-1',
        campaignId: 'camp-1',
        emailJobId: 'job-1',
      });
      expect(result.success).toBe(false);
      expect(result.reason).toContain('[ACCOUNT_DAILY_LIMIT]');
    });

    it('rejects when $transaction throws', async () => {
      const { prisma } = makeLimitPrisma();
      (prisma.$transaction as Fn).mockImplementation(async () => {
        throw new Error('tx failed');
      });
      await expect(
        reserveEmailCapacity(prisma, { userId: 'user-1', emailJobId: 'job-1' })
      ).rejects.toThrow('tx failed');
    });
  });

  describe('commitReservation', () => {
    it('commits an outstanding reservation and moves counters (campaign present)', async () => {
      const { prisma, models } = makeLimitPrisma();
      models.emailSendReservation.findFirst.mockResolvedValue({
        id: 'res-1',
        status: 'RESERVED',
        resolved_at: null,
      });
      await commitReservation(prisma, { userId: 'user-1', campaignId: 'camp-1', emailJobId: 'job-1' });
      expect(models.emailSendReservation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMMITTED' }) })
      );
      expect(models.campaignUsageDaily.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reserved_count: { decrement: 1 }, sent_count: { increment: 1 } }),
        })
      );
    });

    it('advances sent counters when there is no outstanding reservation (campaign present)', async () => {
      const { prisma, models } = makeLimitPrisma();
      models.emailSendReservation.findFirst.mockResolvedValue(null);
      await commitReservation(prisma, { userId: 'user-1', campaignId: 'camp-1', emailJobId: 'job-1' });
      expect(models.emailSendReservation.update).not.toHaveBeenCalled();
      expect(models.emailUsageDaily.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ sent_count: { increment: 1 } }) })
      );
      expect(models.campaignUsageDaily.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ sent_count: { increment: 1 } }) })
      );
    });

    it('skips campaign counters when campaignId is NULL and no reservation', async () => {
      const { prisma, models } = makeLimitPrisma();
      models.emailSendReservation.findFirst.mockResolvedValue(null);
      await commitReservation(prisma, { userId: 'user-1', emailJobId: 'job-1' });
      expect(models.campaignUsageDaily.upsert).not.toHaveBeenCalled();
    });

    it('rejects when $transaction throws', async () => {
      const { prisma } = makeLimitPrisma();
      (prisma.$transaction as Fn).mockImplementation(async () => {
        throw new Error('tx failed');
      });
      await expect(
        commitReservation(prisma, { userId: 'user-1', emailJobId: 'job-1' })
      ).rejects.toThrow('tx failed');
    });
  });

  describe('releaseReservation', () => {
    it('releases outstanding reservations and decrements counters (campaign present)', async () => {
      const { prisma, models } = makeLimitPrisma();
      models.emailSendReservation.findMany.mockResolvedValue([
        { id: 'res-1', status: 'RESERVED', resolved_at: null },
      ]);
      const released = await releaseReservation(prisma, {
        userId: 'user-1',
        campaignId: 'camp-1',
        emailJobId: 'job-1',
      });
      expect(released).toBe(1);
      expect(models.emailSendReservation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'RELEASED' }) })
      );
      expect(models.campaignUsageDaily.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reserved_count: { decrement: 1 } }) })
      );
    });

    it('returns 0 and skips counter updates when nothing is released', async () => {
      const { prisma, models } = makeLimitPrisma();
      models.emailSendReservation.findMany.mockResolvedValue([
        { id: 'res-1', status: 'RELEASED', resolved_at: new Date() },
      ]);
      const released = await releaseReservation(prisma, {
        userId: 'user-1',
        campaignId: 'camp-1',
        emailJobId: 'job-1',
      });
      expect(released).toBe(0);
      expect(models.emailUsageDaily.update).not.toHaveBeenCalled();
      expect(models.campaignUsageDaily.update).not.toHaveBeenCalled();
    });

    it('returns 0 when there are no reservations at all', async () => {
      const { prisma, models } = makeLimitPrisma();
      models.emailSendReservation.findMany.mockResolvedValue([]);
      const released = await releaseReservation(prisma, { userId: 'user-1', emailJobId: 'job-1' });
      expect(released).toBe(0);
      expect(models.campaignUsageDaily.update).not.toHaveBeenCalled();
    });

    it('rejects when $transaction throws', async () => {
      const { prisma } = makeLimitPrisma();
      (prisma.$transaction as Fn).mockImplementation(async () => {
        throw new Error('tx failed');
      });
      await expect(
        releaseReservation(prisma, { userId: 'user-1', emailJobId: 'job-1' })
      ).rejects.toThrow('tx failed');
    });
  });

  describe('recoverReservations', () => {
    it('releases a terminal-state leaked reservation and decrements counters (campaign present)', async () => {
      const { prisma, models } = makeLimitPrisma();
      models.emailSendReservation.findMany.mockResolvedValue([
        {
          id: 'res-1',
          user_id: 'user-1',
          campaign_id: 'camp-1',
          usage_date: new Date(),
          status: 'RESERVED',
          email_job: { user_id: 'user-1', campaign_id: 'camp-1', status: 'SENT' },
        },
      ]);
      const result = await recoverReservations(prisma, { stuckMinutes: 15 });
      expect(result.reconciled).toBe(1);
      expect(models.emailSendReservation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'RELEASED' }) })
      );
      expect(models.emailUsageDaily.update).toHaveBeenCalled();
      expect(models.systemUsageDaily.update).toHaveBeenCalled();
      expect(models.campaignUsageDaily.update).toHaveBeenCalled();
    });
  });

  describe('resolveDeliveryUnknown', () => {
    it("decision 'sent' with no outstanding reservation upserts sent counters (campaign present)", async () => {
      const { prisma, models } = makeLimitPrisma();
      models.emailJob.findUnique.mockResolvedValue({
        id: 'j1',
        status: 'DELIVERY_UNKNOWN',
        user_id: 'u1',
        campaign_id: 'c1',
      });
      models.emailSendReservation.findFirst.mockResolvedValue(null);
      const result = await resolveDeliveryUnknown(prisma, {
        emailJobId: 'j1',
        userId: 'u1',
        campaignId: 'c1',
        decision: 'sent',
      });
      expect(result).toBe('sent');
      expect(models.emailSendReservation.update).not.toHaveBeenCalled();
      expect(models.emailUsageDaily.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ sent_count: { increment: 1 } }) })
      );
      expect(models.campaignUsageDaily.upsert).toHaveBeenCalled();
    });
  });
});
