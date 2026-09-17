import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { getEffectiveDailyEmailLimit, reserveEmailCapacity } from '@/lib/limits/email-limit-service';

describe('lib/limits/email-limit-service', () => {
  describe('getEffectiveDailyEmailLimit', () => {
    it('should return min(global, default) when no overrides', async () => {
      const prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue(null) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const limit = await getEffectiveDailyEmailLimit(prisma, 'user-1');
      expect(limit).toBe(20);
    });

    it('should return user override when set', async () => {
      const prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 100 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const limit = await getEffectiveDailyEmailLimit(prisma, 'user-1');
      expect(limit).toBe(100);
    });

    it('should return campaign limit when set', async () => {
      const prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue(null) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 10 }) },
      } as unknown as PrismaClient;

      const limit = await getEffectiveDailyEmailLimit(prisma, 'user-1', 'campaign-1');
      expect(limit).toBe(10);
    });

    it('should return minimum of all limits', async () => {
      const prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 100 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 50 }) },
      } as unknown as PrismaClient;

      const limit = await getEffectiveDailyEmailLimit(prisma, 'user-1', 'campaign-1');
      expect(limit).toBe(50);
    });

    it('should return hardcoded 20 when settings missing', async () => {
      const prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue(null) },
        user: { findUnique: vi.fn().mockResolvedValue(null) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const limit = await getEffectiveDailyEmailLimit(prisma, 'user-1');
      expect(limit).toBe(20);
    });

    it('should use default_daily_email_limit when user override is null', async () => {
      const prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 50 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: null }) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const limit = await getEffectiveDailyEmailLimit(prisma, 'user-1');
      expect(limit).toBe(50);
    });

    it('should treat 0 as an active zero limit, not skipped', async () => {
      const prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 0 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const limit = await getEffectiveDailyEmailLimit(prisma, 'user-1');
      expect(limit).toBe(0);
    });

    it('should treat campaign daily_limit 0 as an active zero limit', async () => {
      const prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 100 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 0 }) },
      } as unknown as PrismaClient;

      const limit = await getEffectiveDailyEmailLimit(prisma, 'user-1', 'campaign-1');
      expect(limit).toBe(0);
    });
  });

  describe('reserveEmailCapacity', () => {
    it('should fail when email sending is disabled', async () => {
      const prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ email_sending_enabled: false }) },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<{ success: boolean; reason?: string }>) => {
          const tx = {
            systemSetting: { findUnique: vi.fn().mockResolvedValue({ email_sending_enabled: false }) },
            user: { findUnique: vi.fn() },
            emailUsageDaily: { upsert: vi.fn(), update: vi.fn() },
            systemUsageDaily: { upsert: vi.fn(), update: vi.fn() },
            campaignUsageDaily: { upsert: vi.fn(), update: vi.fn() },
            emailSendReservation: { create: vi.fn(), findFirst: vi.fn() },
            campaign: { findUnique: vi.fn() },
          };
          return fn(tx);
        }),
      } as unknown as PrismaClient;

      const result = await reserveEmailCapacity(prisma, { userId: 'user-1', emailJobId: 'job-1' });
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Email sending is currently disabled.');
    });

    it('should fail when user is inactive', async () => {
      const prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ email_sending_enabled: true }) },
        $transaction: vi.fn().mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<{ success: boolean; reason?: string }>) => {
          const tx = {
            systemSetting: { findUnique: vi.fn().mockResolvedValue({ email_sending_enabled: true, global_daily_email_limit: 500, default_daily_email_limit: 20 }) },
            user: { findUnique: vi.fn().mockResolvedValue({ is_active: false, daily_email_limit_override: null }) },
            emailUsageDaily: { upsert: vi.fn(), update: vi.fn() },
            systemUsageDaily: { upsert: vi.fn(), update: vi.fn() },
            campaignUsageDaily: { upsert: vi.fn(), update: vi.fn() },
            emailSendReservation: { create: vi.fn(), findFirst: vi.fn() },
            campaign: { findUnique: vi.fn() },
          };
          return fn(tx);
        }),
      } as unknown as PrismaClient;

      const result = await reserveEmailCapacity(prisma, { userId: 'user-1', emailJobId: 'job-1' });
      expect(result.success).toBe(false);
      expect(result.reason).toBe('User account is inactive.');
    });
  });
});
