import { describe, it, expect, vi } from 'vitest';
import { createMockPrisma, createMockEnv, createMockStorageService } from '@/tests/mocks/helpers';
import { processQueueJob } from '@/lib/jobs/consumer';

vi.mock('@/lib/email/service', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/security/encryption', () => ({
  decryptSecret: vi.fn().mockResolvedValue('decrypted-secret'),
}));

vi.mock('@/lib/storage/storage.factory', () => ({
  createStorageService: vi.fn(),
}));

describe('worker/consumer', () => {
  it('should send email with attachment when resume exists', async () => {
    const { sendEmail } = await import('@/lib/email/service');
    const mockedSendEmail = vi.mocked(sendEmail);
    mockedSendEmail.mockResolvedValue({ success: true });

    const { createStorageService } = await import('@/lib/storage/storage.factory');
    vi.mocked(createStorageService).mockReturnValue(createMockStorageService());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = createMockPrisma() as any;

    prisma.emailJob.findUnique.mockResolvedValue({ id: 'job-1', status: 'QUEUED', user_id: 'user-1', campaign_id: null, to_email: 'test@example.com', template_id: 'template-1', email_account_id: 'account-1', resume_id: 'resume-1', attempt_count: 0 });
    prisma.emailJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', is_active: true });
    prisma.campaign.findUnique.mockResolvedValue(null);
    prisma.systemSetting.findUnique.mockResolvedValue({ email_sending_enabled: true, global_daily_email_limit: 500 });
    prisma.emailUsageDaily.upsert.mockResolvedValue({ sent_count: 0, reserved_count: 0 });
    prisma.emailUsageDaily.update.mockResolvedValue({});
    prisma.systemUsageDaily.upsert.mockResolvedValue({ sent_count: 0, reserved_count: 0 });
    prisma.systemUsageDaily.update.mockResolvedValue({});
    prisma.emailSendReservation.updateMany.mockResolvedValue({ count: 0 });
    prisma.emailSendReservation.create.mockResolvedValue({});
    prisma.emailAccount.findUnique.mockResolvedValue({ id: 'account-1', is_active: true, email: 'from@example.com', provider: 'gmail', encrypted_secret: 'secret' });
    prisma.template.findUnique.mockResolvedValue({ id: 'template-1', subject: 'Hello', body: 'Body' });
    prisma.resume.findUnique.mockResolvedValue({ id: 'resume-1', filename: 'resume.pdf', storage_key: 'key', user_id: 'user-1', deleted_at: null });
    prisma.$transaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<void>) => {
      const tx = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ email_sending_enabled: true, global_daily_email_limit: 500 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1', is_active: true }) },
        emailUsageDaily: { upsert: vi.fn().mockResolvedValue({ sent_count: 0, reserved_count: 0 }), update: vi.fn().mockResolvedValue({}) },
        systemUsageDaily: { upsert: vi.fn().mockResolvedValue({ sent_count: 0, reserved_count: 0 }), update: vi.fn().mockResolvedValue({}) },
        campaignUsageDaily: { upsert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
        emailSendReservation: {
          create: vi.fn().mockResolvedValue({}),
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });

    const env = createMockEnv({
      SMTP_ENCRYPTION_KEY: 'key',
    });

    await processQueueJob(prisma, env, 'job-1');
    expect(mockedSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: expect.objectContaining({
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        }),
      })
    );

    expect(prisma.emailLog.create).toHaveBeenCalledWith({
      data: {
        email_job_id: 'job-1',
        status: 'SENT',
        smtp_response: null,
        error_message: null,
      },
    });
  });
});
