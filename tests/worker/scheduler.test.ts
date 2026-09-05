import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { scheduleDueJobs, recoverStuckJobs, completeFinishedCampaigns, generateCampaignJobs } from '@/lib/jobs/scheduler';

describe('lib/jobs/scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scheduleDueJobs', () => {
    it('should mark due SCHEDULED jobs as QUEUED', async () => {
      const prisma = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'job-1' }]),
      } as unknown as PrismaClient;

      const result = await scheduleDueJobs(prisma);
      expect(result).toEqual(['job-1']);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('should return empty array when no jobs are due', async () => {
      const prisma = {
        $queryRaw: vi.fn().mockResolvedValue([]),
      } as unknown as PrismaClient;

      const result = await scheduleDueJobs(prisma);
      expect(result).toEqual([]);
    });

    it('should use a limit of 100 jobs per run', async () => {
      const prisma = {
        $queryRaw: vi.fn().mockResolvedValue([]),
      } as unknown as PrismaClient;

      await scheduleDueJobs(prisma);
      const mockCalls = (prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls;
      const query = mockCalls[0][0];
      const queryString = typeof query === 'string' ? query : String(query);
      expect(queryString).toContain('LIMIT 100');
    });
  });

  describe('recoverStuckJobs', () => {
    it('should mark stuck PROCESSING jobs as DELIVERY_UNKNOWN', async () => {
      const prisma = {
        emailJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      } as unknown as PrismaClient;

      await recoverStuckJobs(prisma);
      expect(prisma.emailJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'PROCESSING',
            processing_started_at: expect.any(Object),
          },
          data: {
            status: 'DELIVERY_UNKNOWN',
            error_message: 'Job was stuck in processing for more than 10 minutes.',
          },
        })
      );
    });

    it('should not touch non-PROCESSING jobs', async () => {
      const prisma = {
        emailJob: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      } as unknown as PrismaClient;

      await recoverStuckJobs(prisma);
      expect(prisma.emailJob.updateMany).toHaveBeenCalled();
    });
  });

  describe('completeFinishedCampaigns', () => {
    it('should mark ACTIVE campaigns with only terminal jobs as COMPLETED', async () => {
      const prisma = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'c-1' }, { id: 'c-2' }]),
      } as unknown as PrismaClient;

      const result = await completeFinishedCampaigns(prisma);
      expect(result).toEqual(['c-1', 'c-2']);
      expect(prisma.$queryRaw).toHaveBeenCalled();
      const query = (prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const queryString = typeof query === 'string' ? query : String(query);
      expect(queryString).toContain('COMPLETED');
      expect(queryString).toContain('NOT EXISTS');
    });
  });

  describe('generateCampaignJobs', () => {
    it('should substitute template variables per contact', async () => {
      const prisma = {
        contact: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'contact-1', name: 'Jane Doe', email: 'jane@example.com', company: 'Acme', job_title: 'Engineer' },
          ]),
        },
        template: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'template-1',
            subject: 'Hi {{name}}',
            body: 'Hello {{first_name}} at {{company}}',
          }),
        },
        emailJob: {
          createMany: vi.fn().mockResolvedValue({}),
        },
      } as unknown as PrismaClient;

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
        ['contact-1']
      );

      expect(prisma.emailJob.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              to_email: 'jane@example.com',
              subject: 'Hi Jane Doe',
              body: 'Hello Jane at Acme',
            }),
          ]),
        })
      );
    });
  });
});
