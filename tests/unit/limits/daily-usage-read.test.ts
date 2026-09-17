import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { getUserDailyUsage, getCampaignDailyUsage, getSystemDailyUsage } from '@/lib/limits/email-limit-service';

describe('daily usage read helpers', () => {
  describe('getUserDailyUsage', () => {
    it('returns zeros when no usage row exists', async () => {
      const prisma = {
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500 }) },
        user: { findUnique: vi.fn().mockResolvedValue(null) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getUserDailyUsage(prisma, 'user-1');
      expect(usage).toEqual({ sent: 0, reserved: 0, limit: 500, remaining: 500 });
    });

    it('returns sent and reserved counts with remaining', async () => {
      const prisma = {
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 30, reserved_count: 5 }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 100 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getUserDailyUsage(prisma, 'user-1');
      expect(usage).toEqual({ sent: 30, reserved: 5, limit: 100, remaining: 65 });
    });

    it('clamps remaining to zero when over limit', async () => {
      const prisma = {
        emailUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 90, reserved_count: 20 }) },
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 100 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getUserDailyUsage(prisma, 'user-1');
      expect(usage.remaining).toBe(0);
    });
  });

  describe('getCampaignDailyUsage', () => {
    it('returns zeros and null limit when no campaign or usage', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue(null) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage).toEqual({ sent: 0, reserved: 0, limit: null });
    });

    it('returns campaign daily_limit and usage counts', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 10, reserved_count: 2 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 50 }) },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage).toEqual({ sent: 10, reserved: 2, limit: 50 });
    });

    it('returns null limit when campaign has no daily_limit', async () => {
      const prisma = {
        campaignUsageDaily: { findUnique: vi.fn().mockResolvedValue({ sent_count: 3, reserved_count: 0 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: null }) },
      } as unknown as PrismaClient;

      const usage = await getCampaignDailyUsage(prisma, 'camp-1');
      expect(usage).toEqual({ sent: 3, reserved: 0, limit: null });
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
