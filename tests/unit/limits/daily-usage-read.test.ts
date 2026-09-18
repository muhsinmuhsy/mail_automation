import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { getUserDailyUsage, getCampaignDailyUsage, getSystemDailyUsage } from '@/lib/limits/email-limit-service';

describe('daily usage read helpers', () => {
  describe('getUserDailyUsage', () => {
    it('returns zeros when no usage row exists', async () => {
      const prisma = {
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue(null) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getUserDailyUsage(prisma, 'user-1');
      expect(usage).toEqual({ sent: 0, reserved: 0, limit: 20, remaining: 20, limitingScope: 'ACCOUNT', limitingLimit: 20 });
    });

    it('returns sent and reserved counts with remaining', async () => {
      const prisma = {
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 30, reserved_count: 5 }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 100 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getUserDailyUsage(prisma, 'user-1');
      expect(usage).toEqual({ sent: 30, reserved: 5, limit: 100, remaining: 65, limitingScope: 'ACCOUNT', limitingLimit: 100 });
    });

    it('clamps remaining to zero when over limit', async () => {
      const prisma = {
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 90, reserved_count: 20 }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 100 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getUserDailyUsage(prisma, 'user-1');
      expect(usage.remaining).toBe(0);
    });
  });

  describe('getCampaignDailyUsage', () => {
    it('returns zeros and null configuredLimit when campaign not found', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
        systemSetting: { findUnique: vi.fn() },
        user: { findUnique: vi.fn() },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage).toEqual({ sent: 0, reserved: 0, limit: 0, configuredLimit: null, limitingScope: null, limitingLimit: null, accountSent: 0, accountReserved: 0, accountLimit: 0 });
    });

    it('returns effective limit and usage counts', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 10, reserved_count: 2 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 50, user_id: 'user-1' }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 100 }) },
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage.sent).toBe(10);
      expect(usage.reserved).toBe(2);
      expect(usage.limit).toBe(50);
      expect(usage.configuredLimit).toBe(50);
      expect(usage.limitingScope).toBe(null);
    });

    it('returns null configuredLimit when campaign has no daily_limit', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 3, reserved_count: 0 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: null, user_id: 'user-1' }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: null }) },
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage.sent).toBe(3);
      expect(usage.reserved).toBe(0);
      expect(usage.configuredLimit).toBe(null);
      expect(usage.limitingScope).toBe(null);
    });

    it('returns limitingScope ACCOUNT when account limit caps below campaign', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 0, reserved_count: 0 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 100, user_id: 'user-1' }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 50 }) },
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage.limit).toBe(50);
      expect(usage.limitingScope).toBe('ACCOUNT');
      expect(usage.limitingLimit).toBe(50);
    });

    it('returns limitingScope SYSTEM when global limit caps below account', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 0, reserved_count: 0 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 100, user_id: 'user-1' }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 15, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 20 }) },
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage.limit).toBe(15);
      expect(usage.limitingScope).toBe('SYSTEM');
      expect(usage.limitingLimit).toBe(15);
    });

    it('returns limitingScope ACCOUNT when global and account are tied', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 0, reserved_count: 0 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 100, user_id: 'user-1' }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 50, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 50 }) },
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage.limit).toBe(50);
      expect(usage.limitingScope).toBe('ACCOUNT');
      expect(usage.limitingLimit).toBe(50);
    });

    it('returns null limitingScope when account equals campaign limit', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 0, reserved_count: 0 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 20, user_id: 'user-1' }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: null }) },
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage.limit).toBe(20);
      expect(usage.limitingScope).toBe(null);
    });

    it('returns null limitingScope when global equals campaign limit', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 0, reserved_count: 0 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 20, user_id: 'user-1' }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 20, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 50 }) },
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage.limit).toBe(20);
      expect(usage.limitingScope).toBe(null);
    });

    it('returns limitingScope SYSTEM when global is 0', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 0, reserved_count: 0 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 10, user_id: 'user-1' }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 0, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 20 }) },
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage.limit).toBe(0);
      expect(usage.limitingScope).toBe('SYSTEM');
    });

    it('returns limitingScope ACCOUNT when account is 0', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 0, reserved_count: 0 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 10, user_id: 'user-1' }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 0 }) },
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage.limit).toBe(0);
      expect(usage.limitingScope).toBe('ACCOUNT');
    });
  });

  describe('getSystemDailyUsage', () => {
    it('returns zeros and default 500 when no settings', async () => {
      const prisma = {
        systemUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getSystemDailyUsage(prisma);
      expect(usage).toEqual({ sent: 0, reserved: 0, limit: 500 });
    });

    it('returns counts and global limit from settings', async () => {
      const prisma = {
        systemUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 200, reserved_count: 15 }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 1000 }) },
      } as unknown as PrismaClient;

      const usage = await getSystemDailyUsage(prisma);
      expect(usage).toEqual({ sent: 200, reserved: 15, limit: 1000 });
    });
  });
});
