import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { getEffectiveDailyEmailLimit, reserveEmailCapacity } from '@/lib/limits/email-limit-service';

describe('lib/limits/email-limit-service', () => {
  let prisma: PrismaClient;

  describe('getEffectiveDailyEmailLimit', () => {
    it('should return global limit when no overrides', async () => {
      prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: null }) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const limit = await getEffectiveDailyEmailLimit(prisma, 'user-1');
      expect(limit).toBe(500);
    });

    it('should respect user override', async () => {
      prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: 100 }) },
        campaign: { findUnique: vi.fn().mockResolvedValue(null) },
      } as unknown as PrismaClient;

      const limit = await getEffectiveDailyEmailLimit(prisma, 'user-1');
      expect(limit).toBe(100);
    });

    it('should respect campaign limit', async () => {
      prisma = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ global_daily_email_limit: 500 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ daily_email_limit_override: null }) },
        campaign: { findUnique: vi.fn().mockResolvedValue({ daily_limit: 50 }) },
      } as unknown as PrismaClient;

      const limit = await getEffectiveDailyEmailLimit(prisma, 'user-1', 'campaign-1');
      expect(limit).toBe(50);
    });
  });

  describe('reserveEmailCapacity', () => {
    it('should fail when sending is disabled', async () => {
      const mockTx = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ email_sending_enabled: false }) },
        user: { findUnique: vi.fn().mockResolvedValue({ is_active: true }) },
        emailUsageDaily: { upsert: vi.fn(), update: vi.fn() },
        systemUsageDaily: { upsert: vi.fn(), update: vi.fn() },
        campaignUsageDaily: { upsert: vi.fn(), update: vi.fn() },
        emailSendReservation: { create: vi.fn() },
      }));

      prisma = {
        systemSetting: { findUnique: vi.fn() },
        $transaction: mockTx,
      } as unknown as PrismaClient;

      const result = await reserveEmailCapacity(prisma, { userId: 'user-1', emailJobId: 'job-1' });
      expect(result.success).toBe(false);
    });
  });
});
