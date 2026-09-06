import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { generateCampaignJobs } from '@/lib/jobs/scheduler';

describe('lib/campaigns/scheduler', () => {
  it('should generate jobs with correct scheduled_at in UTC', async () => {
    const mockContact = { id: 'contact-1', email: 'test@example.com', user_id: 'user-1' };
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      contact: { findMany: vi.fn().mockResolvedValue([mockContact]) },
      template: { findUnique: vi.fn().mockResolvedValue({ subject: 'Subject', body: 'Body' }) },
      emailJob: { createMany },
    } as unknown as PrismaClient;

    const campaign = {
      id: 'campaign-1',
      user_id: 'user-1',
      start_at: new Date('2024-01-15T09:00:00Z'),
      timezone: 'UTC',
      interval_minutes: 10,
      daily_limit: 20,
      email_account_id: 'account-1',
      attachment_id: 'attachment-1',
      template_id: 'template-1',
    };

    await generateCampaignJobs(prisma, campaign, ['contact-1']);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          user_id: 'user-1',
          campaign_id: 'campaign-1',
          contact_id: 'contact-1',
          email_account_id: 'account-1',
          attachment_id: 'attachment-1',
          attachment_ids: ['attachment-1'],
          template_id: 'template-1',
          to_email: 'test@example.com',
          subject: 'Subject',
          body: 'Body',
          scheduled_at: new Date('2024-01-15T09:00:00Z'),
          status: 'SCHEDULED',
          attempt_count: 0,
        },
      ],
    });
  });

  it('should distribute jobs across days based on daily_limit', async () => {
    const contacts = Array.from({ length: 25 }, (_, i) => ({
      id: `contact-${i}`,
      email: `test${i}@example.com`,
      user_id: 'user-1',
    }));

    const createMany = vi.fn().mockResolvedValue({ count: 25 });
    const prisma = {
      contact: { findMany: vi.fn().mockResolvedValue(contacts) },
      template: { findUnique: vi.fn().mockResolvedValue({ subject: 'S', body: 'B' }) },
      emailJob: { createMany },
    } as unknown as PrismaClient;

    const campaign = {
      id: 'campaign-1',
      user_id: 'user-1',
      start_at: new Date('2024-01-15T09:00:00Z'),
      timezone: 'UTC',
      interval_minutes: 10,
      daily_limit: 20,
      email_account_id: 'account-1',
      attachment_id: 'attachment-1',
      template_id: 'template-1',
    };

    await generateCampaignJobs(prisma, campaign, contacts.map((c) => c.id));

    const call = createMany.mock.calls[0];
    const jobs = call[0].data as Array<{ scheduled_at: Date }>;

    expect(jobs.length).toBe(25);
    expect(jobs[0].scheduled_at.getUTCDate()).toBe(15);
    expect(jobs[19].scheduled_at.getUTCDate()).toBe(15);
    expect(jobs[20].scheduled_at.getUTCDate()).toBe(16);
  });

  it('preserves the UTC instant without applying the timezone twice', async () => {
    const mockContact = { id: 'contact-1', email: 'test@example.com', user_id: 'user-1' };
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      contact: { findMany: vi.fn().mockResolvedValue([mockContact]) },
      template: { findUnique: vi.fn().mockResolvedValue({ subject: 'S', body: 'B' }) },
      emailJob: { createMany },
    } as unknown as PrismaClient;

    const campaign = {
      id: 'campaign-1',
      user_id: 'user-1',
      start_at: new Date('2024-01-15T09:00:00Z'),
      timezone: 'America/New_York',
      interval_minutes: 10,
      daily_limit: 20,
      email_account_id: 'account-1',
      attachment_id: 'attachment-1',
      template_id: 'template-1',
    };

    await generateCampaignJobs(prisma, campaign, ['contact-1']);

    const call = createMany.mock.calls[0];
    const jobs = call[0].data as Array<{ scheduled_at: Date }>;

    expect(jobs.length).toBe(1);
    const scheduledAt = jobs[0].scheduled_at;
    expect(scheduledAt.toISOString()).toBe('2024-01-15T09:00:00.000Z');
  });
});
