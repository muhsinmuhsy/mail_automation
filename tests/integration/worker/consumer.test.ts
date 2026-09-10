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

describe('integration/worker (consumer, no real DB)', () => {
  it('sends an email with attachment and marks the job SENT on success', async () => {
    const { sendEmail } = await import('@/lib/email/service');
    const mockedSendEmail = vi.mocked(sendEmail);
    mockedSendEmail.mockResolvedValue({ success: true, smtpResponse: '250 OK' });

    const { createStorageService } = await import('@/lib/storage/storage.factory');
    vi.mocked(createStorageService).mockReturnValue(createMockStorageService());


    const prisma = createMockPrisma() as any;
    prisma.emailJob.findUnique.mockResolvedValue({
      id: 'job-1', status: 'QUEUED', user_id: 'user-1', campaign_id: null,
      to_email: 'test@example.com', template_id: 'template-1', email_account_id: 'account-1',
      attachment_id: 'attachment-1', attempt_count: 0,
    });
    prisma.emailJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', is_active: true });
    prisma.campaign.findUnique.mockResolvedValue(null);
    prisma.systemSetting.findUnique.mockResolvedValue({ email_sending_enabled: true, global_daily_email_limit: 500 });
    prisma.emailUsageDaily.upsert.mockResolvedValue({});
    prisma.emailUsageDaily.update.mockResolvedValue({});
    prisma.systemUsageDaily.upsert.mockResolvedValue({});
    prisma.systemUsageDaily.update.mockResolvedValue({});
    prisma.emailSendReservation.updateMany.mockResolvedValue({ count: 0 });
    prisma.emailSendReservation.create.mockResolvedValue({});
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: 'account-1', is_active: true, email: 'from@example.com', provider: 'gmail', encrypted_secret: 'secret',
    });
    prisma.template.findUnique.mockResolvedValue({ id: 'template-1', subject: 'Hello', body: 'Body' });
    prisma.attachment.findUnique.mockResolvedValue({
      id: 'attachment-1', filename: 'attachment.pdf', storage_key: 'key', user_id: 'user-1', deleted_at: null,
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<void>) => {
      const tx = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ email_sending_enabled: true, global_daily_email_limit: 500 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1', is_active: true }) },
        emailUsageDaily: { upsert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
        systemUsageDaily: { upsert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
        campaignUsageDaily: { upsert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
        emailSendReservation: {
          create: vi.fn().mockResolvedValue({}),
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });
    prisma.emailJob.update = vi.fn().mockResolvedValue({});
    prisma.emailLog.create = vi.fn().mockResolvedValue({});

    const env = createMockEnv({ SMTP_ENCRYPTION_KEY: 'key' });

    await processQueueJob(prisma, env, 'job-1');

    expect(mockedSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ filename: 'attachment.pdf', contentType: 'application/pdf' })],
      }),
    );
    expect(prisma.emailJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'job-1' }, data: expect.objectContaining({ status: 'SENT' }) }),
    );
    expect(prisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
    );
  });

  it('returns early when the job no longer exists', async () => {
    const { sendEmail } = await import('@/lib/email/service');

    const prisma = createMockPrisma() as any;
    prisma.emailJob.findUnique.mockResolvedValue(null);
    await processQueueJob(prisma, createMockEnv(), 'missing');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('passes bodyHtml through to sendEmail when the job has body_html', async () => {
    const { sendEmail } = await import('@/lib/email/service');
    const mockedSendEmail = vi.mocked(sendEmail);
    mockedSendEmail.mockResolvedValue({ success: true, smtpResponse: '250 OK' });

    const { createStorageService } = await import('@/lib/storage/storage.factory');
    vi.mocked(createStorageService).mockReturnValue(createMockStorageService());

    const prisma = createMockPrisma() as any;
    prisma.emailJob.findUnique.mockResolvedValue({
      id: 'job-1', status: 'QUEUED', user_id: 'user-1', campaign_id: null,
      to_email: 'test@example.com', template_id: 'template-1', email_account_id: 'account-1',
      attachment_id: null, attachment_ids: [], attempt_count: 0,
      body: 'Hello Jane', body_html: '<p>Hello Jane</p>', subject: 'Hi Jane',
    });
    prisma.emailJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', is_active: true });
    prisma.campaign.findUnique.mockResolvedValue(null);
    prisma.systemSetting.findUnique.mockResolvedValue({ email_sending_enabled: true, global_daily_email_limit: 500 });
    prisma.emailUsageDaily.upsert.mockResolvedValue({});
    prisma.emailUsageDaily.update.mockResolvedValue({});
    prisma.systemUsageDaily.upsert.mockResolvedValue({});
    prisma.systemUsageDaily.update.mockResolvedValue({});
    prisma.emailSendReservation.updateMany.mockResolvedValue({ count: 0 });
    prisma.emailSendReservation.create.mockResolvedValue({});
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: 'account-1', is_active: true, email: 'from@example.com', provider: 'gmail', encrypted_secret: 'secret',
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<void>) => {
      const tx = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ email_sending_enabled: true, global_daily_email_limit: 500 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1', is_active: true }) },
        emailUsageDaily: { upsert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
        systemUsageDaily: { upsert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
        campaignUsageDaily: { upsert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
        emailSendReservation: {
          create: vi.fn().mockResolvedValue({}),
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });
    prisma.emailJob.update = vi.fn().mockResolvedValue({});
    prisma.emailLog.create = vi.fn().mockResolvedValue({});

    const env = createMockEnv({ SMTP_ENCRYPTION_KEY: 'key' });

    await processQueueJob(prisma, env, 'job-1');

    expect(mockedSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Hello Jane',
        bodyHtml: '<p>Hello Jane</p>',
      }),
    );
  });

  it('omits bodyHtml when the job has body_html = null (legacy template)', async () => {
    const { sendEmail } = await import('@/lib/email/service');
    const mockedSendEmail = vi.mocked(sendEmail);
    mockedSendEmail.mockResolvedValue({ success: true, smtpResponse: '250 OK' });

    const { createStorageService } = await import('@/lib/storage/storage.factory');
    vi.mocked(createStorageService).mockReturnValue(createMockStorageService());

    const prisma = createMockPrisma() as any;
    prisma.emailJob.findUnique.mockResolvedValue({
      id: 'job-1', status: 'QUEUED', user_id: 'user-1', campaign_id: null,
      to_email: 'test@example.com', template_id: 'template-1', email_account_id: 'account-1',
      attachment_id: null, attachment_ids: [], attempt_count: 0,
      body: 'Hello Jane', body_html: null, subject: 'Hi Jane',
    });
    prisma.emailJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', is_active: true });
    prisma.campaign.findUnique.mockResolvedValue(null);
    prisma.systemSetting.findUnique.mockResolvedValue({ email_sending_enabled: true, global_daily_email_limit: 500 });
    prisma.emailUsageDaily.upsert.mockResolvedValue({});
    prisma.emailUsageDaily.update.mockResolvedValue({});
    prisma.systemUsageDaily.upsert.mockResolvedValue({});
    prisma.systemUsageDaily.update.mockResolvedValue({});
    prisma.emailSendReservation.updateMany.mockResolvedValue({ count: 0 });
    prisma.emailSendReservation.create.mockResolvedValue({});
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: 'account-1', is_active: true, email: 'from@example.com', provider: 'gmail', encrypted_secret: 'secret',
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<void>) => {
      const tx = {
        systemSetting: { findUnique: vi.fn().mockResolvedValue({ email_sending_enabled: true, global_daily_email_limit: 500 }) },
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1', is_active: true }) },
        emailUsageDaily: { upsert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
        systemUsageDaily: { upsert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
        campaignUsageDaily: { upsert: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}) },
        emailSendReservation: {
          create: vi.fn().mockResolvedValue({}),
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });
    prisma.emailJob.update = vi.fn().mockResolvedValue({});
    prisma.emailLog.create = vi.fn().mockResolvedValue({});

    const env = createMockEnv({ SMTP_ENCRYPTION_KEY: 'key' });

    await processQueueJob(prisma, env, 'job-1');

    expect(mockedSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Hello Jane',
        bodyHtml: undefined,
      }),
    );
  });
});
