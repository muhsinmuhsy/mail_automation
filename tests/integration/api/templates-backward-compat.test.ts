import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, createMockEnv, createMockStorageService } from '@/tests/mocks/helpers';
import { generateCampaignJobs } from '@/lib/jobs/scheduler';
import { processQueueJob } from '@/lib/jobs/consumer';
import { buildMimeMessage } from '@/lib/email/mime';

vi.mock('@/lib/email/service', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/security/encryption', () => ({
  decryptSecret: vi.fn().mockResolvedValue('decrypted-secret'),
}));

vi.mock('@/lib/storage/storage.factory', () => ({
  createStorageService: vi.fn(),
}));

describe('templates backward compatibility (§14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateCampaignJobs with legacy template', () => {
    it('creates EmailJob rows with body_html = null for legacy plain-text templates', async () => {
      const prisma = createMockPrisma() as any;

      prisma.contact.findMany.mockResolvedValue([
        {
          id: 'contact-1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          contact_field_values: [],
        },
      ]);
      prisma.contactField.findMany.mockResolvedValue([]);
      prisma.template.findUnique.mockResolvedValue({
        id: 'legacy-template-1',
        subject: 'Hi {{name}}',
        body: 'Hello {{first_name}}',
        body_text: 'Hello {{first_name}}',
        body_html: null,
        body_json: null,
        body_mjml: null,
      });
      prisma.emailJob.createMany.mockResolvedValue({ count: 1 });

      await generateCampaignJobs(
        prisma,
        {
          id: 'campaign-1',
          user_id: 'user-1',
          start_at: new Date('2026-01-01T09:00:00Z'),
          timezone: 'UTC',
          interval_minutes: 10,
          email_account_id: 'account-1',
          attachment_id: null,
          template_id: 'legacy-template-1',
        },
        ['contact-1'],
      );

      expect(prisma.emailJob.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              to_email: 'jane@example.com',
              subject: 'Hi Jane Doe',
              body: 'Hello Jane',
              body_html: null,
            }),
          ]),
        }),
      );
    });

    it('creates EmailJob rows with body_html populated for visual templates', async () => {
      const prisma = createMockPrisma() as any;

      prisma.contact.findMany.mockResolvedValue([
        {
          id: 'contact-1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          contact_field_values: [],
        },
      ]);
      prisma.contactField.findMany.mockResolvedValue([]);
      prisma.template.findUnique.mockResolvedValue({
        id: 'visual-template-1',
        subject: 'Hi {{name}}',
        body: 'Hello {{first_name}}',
        body_text: 'Hello {{first_name}}',
        body_html: '<p>Hello {{first_name}}</p>',
        body_json: '{"type":"doc"}',
        body_mjml: '<mjml></mjml>',
      });
      prisma.emailJob.createMany.mockResolvedValue({ count: 1 });

      await generateCampaignJobs(
        prisma,
        {
          id: 'campaign-2',
          user_id: 'user-1',
          start_at: new Date('2026-01-01T09:00:00Z'),
          timezone: 'UTC',
          interval_minutes: 10,
          email_account_id: 'account-1',
          attachment_id: null,
          template_id: 'visual-template-1',
        },
        ['contact-1'],
      );

      expect(prisma.emailJob.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              to_email: 'jane@example.com',
              subject: 'Hi Jane Doe',
              body: 'Hello Jane',
              body_html: '<p>Hello Jane</p>',
            }),
          ]),
        }),
      );
    });
  });

  describe('consumer with legacy template (no multipart/alternative)', () => {
    it('calls sendEmail without bodyHtml for legacy plain-text jobs', async () => {
      const { sendEmail } = await import('@/lib/email/service');
      const mockedSendEmail = vi.mocked(sendEmail);
      mockedSendEmail.mockResolvedValue({ success: true, smtpResponse: '250 OK' });

      const { createStorageService } = await import('@/lib/storage/storage.factory');
      vi.mocked(createStorageService).mockReturnValue(createMockStorageService());

      const prisma = createMockPrisma() as any;

      prisma.emailJob.findUnique.mockResolvedValue({
        id: 'job-legacy-1',
        status: 'QUEUED',
        user_id: 'user-1',
        campaign_id: null,
        to_email: 'test@example.com',
        template_id: 'legacy-template-1',
        email_account_id: 'account-1',
        attachment_id: null,
        attachment_ids: [],
        body: 'Hello Jane',
        body_html: null,
        subject: 'Hi Jane Doe',
        attempt_count: 0,
      });
      prisma.emailJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', is_active: true });
      prisma.campaign.findUnique.mockResolvedValue(null);
      prisma.systemSetting.findUnique.mockResolvedValue({
        email_sending_enabled: true,
        global_daily_email_limit: 500,
      });
      prisma.emailUsageDaily.upsert.mockResolvedValue({});
      prisma.emailUsageDaily.update.mockResolvedValue({});
      prisma.systemUsageDaily.upsert.mockResolvedValue({});
      prisma.systemUsageDaily.update.mockResolvedValue({});
      prisma.emailSendReservation.updateMany.mockResolvedValue({ count: 0 });
      prisma.emailSendReservation.create.mockResolvedValue({});
      prisma.emailAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        is_active: true,
        email: 'from@example.com',
        provider: 'gmail',
        encrypted_secret: 'secret',
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

      await processQueueJob(prisma, env, 'job-legacy-1');

      expect(mockedSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Hello Jane',
          bodyHtml: undefined,
        }),
      );
    });

    it('calls sendEmail with bodyHtml for visual template jobs', async () => {
      const { sendEmail } = await import('@/lib/email/service');
      const mockedSendEmail = vi.mocked(sendEmail);
      mockedSendEmail.mockResolvedValue({ success: true, smtpResponse: '250 OK' });

      const { createStorageService } = await import('@/lib/storage/storage.factory');
      vi.mocked(createStorageService).mockReturnValue(createMockStorageService());

      const prisma = createMockPrisma() as any;

      prisma.emailJob.findUnique.mockResolvedValue({
        id: 'job-visual-1',
        status: 'QUEUED',
        user_id: 'user-1',
        campaign_id: null,
        to_email: 'test@example.com',
        template_id: 'visual-template-1',
        email_account_id: 'account-1',
        attachment_id: null,
        attachment_ids: [],
        body: 'Hello Jane',
        body_html: '<p>Hello Jane</p>',
        subject: 'Hi Jane Doe',
        attempt_count: 0,
      });
      prisma.emailJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', is_active: true });
      prisma.campaign.findUnique.mockResolvedValue(null);
      prisma.systemSetting.findUnique.mockResolvedValue({
        email_sending_enabled: true,
        global_daily_email_limit: 500,
      });
      prisma.emailUsageDaily.upsert.mockResolvedValue({});
      prisma.emailUsageDaily.update.mockResolvedValue({});
      prisma.systemUsageDaily.upsert.mockResolvedValue({});
      prisma.systemUsageDaily.update.mockResolvedValue({});
      prisma.emailSendReservation.updateMany.mockResolvedValue({ count: 0 });
      prisma.emailSendReservation.create.mockResolvedValue({});
      prisma.emailAccount.findUnique.mockResolvedValue({
        id: 'account-1',
        is_active: true,
        email: 'from@example.com',
        provider: 'gmail',
        encrypted_secret: 'secret',
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

      await processQueueJob(prisma, env, 'job-visual-1');

      expect(mockedSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Hello Jane',
          bodyHtml: '<p>Hello Jane</p>',
        }),
      );
    });
  });

  describe('MIME structure for legacy vs visual', () => {
    it('legacy plain-text produces a single text/plain part (no multipart/alternative)', () => {
      const mime = buildMimeMessage({
        from: 'from@example.com',
        to: 'to@example.com',
        subject: 'Hi Jane',
        body: 'Hello Jane',
      });

      expect(mime).not.toContain('multipart/alternative');
      expect(mime).toContain('text/plain');
    });

    it('visual template with bodyHtml produces multipart/alternative', () => {
      const mime = buildMimeMessage({
        from: 'from@example.com',
        to: 'to@example.com',
        subject: 'Hi Jane',
        body: 'Hello Jane',
        bodyHtml: '<p>Hello Jane</p>',
      });

      expect(mime).toContain('multipart/alternative');
      expect(mime).toContain('text/plain');
      expect(mime).toContain('text/html');
    });
  });
});
