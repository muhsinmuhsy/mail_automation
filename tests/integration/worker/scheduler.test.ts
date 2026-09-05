import { describe, it, expect } from 'vitest';
import { createMockPrisma } from '@/tests/mocks/helpers';
import {
  scheduleDueJobs,
  recoverStuckJobs,
  completeFinishedCampaigns,
  generateCampaignJobs,
} from '@/lib/jobs/scheduler';

describe('integration/worker (scheduler, no real DB)', () => {
  it('scheduleDueJobs marks due jobs QUEUED and returns their ids', async () => {

    const prisma = createMockPrisma() as any;
    prisma.$queryRaw.mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }]);

    const ids = await scheduleDueJobs(prisma);
    expect(ids).toEqual(['job-1', 'job-2']);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it('scheduleDueJobs returns an empty array when nothing is due', async () => {

    const prisma = createMockPrisma() as any;
    prisma.$queryRaw.mockResolvedValue([]);
    expect(await scheduleDueJobs(prisma)).toEqual([]);
  });

  it('recoverStuckJobs flips stuck PROCESSING jobs to DELIVERY_UNKNOWN', async () => {

    const prisma = createMockPrisma() as any;
    prisma.emailJob.updateMany.mockResolvedValue({ count: 3 });

    await recoverStuckJobs(prisma);
    expect(prisma.emailJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PROCESSING' }),
        data: expect.objectContaining({ status: 'DELIVERY_UNKNOWN' }),
      }),
    );
  });

  it('completeFinishedCampaigns marks ACTIVE campaigns with only terminal jobs COMPLETED', async () => {

    const prisma = createMockPrisma() as any;
    prisma.$queryRaw.mockResolvedValue([{ id: 'c-1' }]);

    const ids = await completeFinishedCampaigns(prisma);
    expect(ids).toEqual(['c-1']);
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it('generateCampaignJobs substitutes template variables per contact and persists jobs', async () => {

    const prisma = createMockPrisma() as any;
    prisma.contact.findMany.mockResolvedValue([
      { id: 'contact-1', name: 'Jane Doe', first_name: 'Jane', email: 'jane@example.com', company: 'Acme' },
      { id: 'contact-2', name: 'John Roe', first_name: 'John', email: 'john@example.com', company: 'Globex' },
    ]);
    prisma.template.findUnique.mockResolvedValue({
      id: 'template-1',
      subject: 'Hi {{name}}',
      body: 'Hello {{first_name}} at {{company}}',
    });
    prisma.emailJob.createMany.mockResolvedValue({ count: 2 });

    await generateCampaignJobs(
      prisma,
      {
        id: 'campaign-1',
        user_id: 'user-1',
        start_at: new Date('2026-01-01T09:00:00Z'),
        timezone: 'UTC',
        interval_minutes: 10,
        email_account_id: 'account-1',
        attachment_id: 'attachment-1',
        template_id: 'template-1',
      },
      ['contact-1', 'contact-2'],
    );

    expect(prisma.emailJob.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            to_email: 'jane@example.com',
            subject: 'Hi Jane Doe',
            body: 'Hello Jane at Acme',
          }),
          expect.objectContaining({
            to_email: 'john@example.com',
            subject: 'Hi John Roe',
            body: 'Hello John at Globex',
          }),
        ]),
      }),
    );
  });

  it('generateCampaignJobs short-circuits when no contacts match', async () => {

    const prisma = createMockPrisma() as any;
    prisma.contact.findMany.mockResolvedValue([]);
    await generateCampaignJobs(prisma, {
      id: 'campaign-1',
      user_id: 'user-1',
      start_at: new Date(),
      timezone: 'UTC',
      interval_minutes: 10,
      email_account_id: 'account-1',
      attachment_id: 'attachment-1',
      template_id: 'template-1',
    }, ['x']);
    expect(prisma.emailJob.createMany).not.toHaveBeenCalled();
  });

  it('generateCampaignJobs throws when the template is missing', async () => {

    const prisma = createMockPrisma() as any;
    prisma.contact.findMany.mockResolvedValue([{ id: 'c1', email: 'a@b.c' }]);
    prisma.template.findUnique.mockResolvedValue(null);
    await expect(
      generateCampaignJobs(prisma, {
        id: 'campaign-1',
        user_id: 'user-1',
        start_at: new Date(),
        timezone: 'UTC',
        interval_minutes: 10,
        email_account_id: 'account-1',
        attachment_id: 'attachment-1',
        template_id: 'missing',
      }, ['c1']),
    ).rejects.toThrow(/Template missing not found/);
  });
});
