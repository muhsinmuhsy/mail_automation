import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const processQueueJob = vi.fn();
  const scheduleDueJobs = vi.fn();
  const recoverStuckJobs = vi.fn();
  const completeFinishedCampaigns = vi.fn();
  const recoverReservations = vi.fn();
  const prismaMock = {
    $disconnect: vi.fn(),
    systemSetting: { findUnique: vi.fn() },
  };
  const createPrisma = vi.fn((..._a: unknown[]) => prismaMock);
  return {
    processQueueJob,
    scheduleDueJobs,
    recoverStuckJobs,
    completeFinishedCampaigns,
    recoverReservations,
    prismaMock,
    createPrisma,
  };
});

vi.mock('@/lib/generated/prisma/client', () => ({
  PrismaClient: class {},
}));

vi.mock('@/lib/db/prisma', () => ({
  createPrisma: (...a: unknown[]) => mocks.createPrisma(...a),
}));

vi.mock('@/lib/jobs/consumer', () => ({
  processQueueJob: (...a: unknown[]) => mocks.processQueueJob(...a),
}));

vi.mock('@/lib/jobs/scheduler', () => ({
  scheduleDueJobs: (...a: unknown[]) => mocks.scheduleDueJobs(...a),
  recoverStuckJobs: (...a: unknown[]) => mocks.recoverStuckJobs(...a),
  completeFinishedCampaigns: (...a: unknown[]) => mocks.completeFinishedCampaigns(...a),
}));

vi.mock('@/lib/limits/email-limit-service', () => ({
  recoverReservations: (...a: unknown[]) => mocks.recoverReservations(...a),
}));

vi.mock('@/worker/smtp', () => ({ workerSocketFactory: { connect: vi.fn() } }));
import workerHandler from '@/worker';

function makeMessage(jobId: string | undefined) {
  return {
    body: jobId ? { jobId } : undefined,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

const env = (overrides: Record<string, unknown> = {}) => ({
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  EMAIL_QUEUE: { sendBatch: vi.fn().mockResolvedValue(undefined) },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.processQueueJob.mockResolvedValue(undefined);
  mocks.scheduleDueJobs.mockResolvedValue([]);
  mocks.recoverStuckJobs.mockResolvedValue(undefined);
  mocks.completeFinishedCampaigns.mockResolvedValue([]);
  mocks.recoverReservations.mockResolvedValue(undefined);
  mocks.prismaMock.systemSetting.findUnique.mockResolvedValue({ email_sending_enabled: true });
});

describe('worker/index', () => {
  describe('fetch', () => {
    it('returns a small health response', async () => {
      const result = await workerHandler.fetch(new Request('https://worker.test/health'));

      expect(result.status).toBe(200);
      await expect(result.json()).resolves.toEqual({
        status: 'ok',
        service: 'mail-automation-worker',
        emailTransports: ['gmail_api', 'gmail_smtp'],
      });
    });

    it('does not serve the Next.js app from Cloudflare Worker fetch', async () => {
      const result = await workerHandler.fetch(new Request('https://worker.test/dashboard'));

      expect(result.status).toBe(404);
      await expect(result.json()).resolves.toEqual({
        success: false,
        error: {
          type: 'NOT_FOUND',
          message: 'This Cloudflare Worker only handles background automation.',
        },
      });
    });
  });

  describe('scheduled', () => {
    it('recovers, schedules due jobs and enqueues them when sending is enabled', async () => {
      mocks.scheduleDueJobs.mockResolvedValue(['job-1', 'job-2']);
      const sendBatch = vi.fn().mockResolvedValue(undefined);
      const e = env({ EMAIL_QUEUE: { send: vi.fn(), sendBatch } });

      await workerHandler.scheduled({} as never, e as never);

      expect(mocks.createPrisma).toHaveBeenCalledWith('postgresql://u:p@localhost:5432/db');
      expect(mocks.recoverStuckJobs).toHaveBeenCalledWith(mocks.prismaMock);
      expect(mocks.recoverReservations).toHaveBeenCalledWith(mocks.prismaMock, { stuckMinutes: 15 });
      expect(mocks.prismaMock.systemSetting.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mocks.scheduleDueJobs).toHaveBeenCalledWith(mocks.prismaMock);
      expect(sendBatch).toHaveBeenCalledWith([
        { body: { jobId: 'job-1' } },
        { body: { jobId: 'job-2' } },
      ]);
      expect(mocks.completeFinishedCampaigns).toHaveBeenCalledWith(mocks.prismaMock);
      expect(mocks.prismaMock.$disconnect).toHaveBeenCalledOnce();
    });

    it('does not schedule new jobs when sending is disabled', async () => {
      mocks.prismaMock.systemSetting.findUnique.mockResolvedValue({ email_sending_enabled: false });
      const sendBatch = vi.fn().mockResolvedValue(undefined);

      await workerHandler.scheduled({} as never, env({ EMAIL_QUEUE: { send: vi.fn(), sendBatch } }) as never);

      expect(mocks.scheduleDueJobs).not.toHaveBeenCalled();
      expect(sendBatch).not.toHaveBeenCalled();
      expect(mocks.completeFinishedCampaigns).toHaveBeenCalledWith(mocks.prismaMock);
      expect(mocks.prismaMock.$disconnect).toHaveBeenCalledOnce();
    });

    it('defaults sending to enabled when no system setting exists', async () => {
      mocks.prismaMock.systemSetting.findUnique.mockResolvedValue(null);
      mocks.scheduleDueJobs.mockResolvedValue(['job-x']);

      await workerHandler.scheduled({} as never, env() as never);

      expect(mocks.scheduleDueJobs).toHaveBeenCalledWith(mocks.prismaMock);
      expect(mocks.prismaMock.$disconnect).toHaveBeenCalledOnce();
    });

    it('disconnects even when a scheduled step throws', async () => {
      mocks.scheduleDueJobs.mockRejectedValue(new Error('db down'));
      await expect(workerHandler.scheduled({} as never, env() as never)).rejects.toThrow('db down');
      expect(mocks.prismaMock.$disconnect).toHaveBeenCalledOnce();
    });

    it('fails before claiming jobs when there is no EMAIL_QUEUE binding', async () => {
      mocks.scheduleDueJobs.mockResolvedValue(['job-1']);
      await expect(workerHandler.scheduled({} as never, env({ EMAIL_QUEUE: undefined }) as never)).rejects.toThrow('EMAIL_QUEUE');
      expect(mocks.scheduleDueJobs).not.toHaveBeenCalled();
      expect(mocks.prismaMock.$disconnect).toHaveBeenCalledOnce();
    });
  });

  describe('queue', () => {
    it('processes each message and acks on success', async () => {
      const m1 = makeMessage('job-1');
      const m2 = makeMessage('job-2');

      await workerHandler.queue({ messages: [m1, m2] } as never, env() as never);

      expect(mocks.processQueueJob).toHaveBeenCalledTimes(2);
      expect(mocks.processQueueJob).toHaveBeenCalledWith(mocks.prismaMock, expect.objectContaining({ DATABASE_URL: expect.any(String) }), 'job-1', { socketFactory: expect.objectContaining({ connect: expect.any(Function) }) });
      expect(mocks.processQueueJob).toHaveBeenCalledWith(mocks.prismaMock, expect.objectContaining({ DATABASE_URL: expect.any(String) }), 'job-2', { socketFactory: expect.objectContaining({ connect: expect.any(Function) }) });
      expect(m1.ack).toHaveBeenCalledOnce();
      expect(m2.ack).toHaveBeenCalledOnce();
      expect(m1.retry).not.toHaveBeenCalled();
      expect(mocks.prismaMock.$disconnect).toHaveBeenCalledOnce();
    });

    it('acks messages without a jobId without processing', async () => {
      const m = makeMessage(undefined);
      await workerHandler.queue({ messages: [m] } as never, env() as never);
      expect(mocks.processQueueJob).not.toHaveBeenCalled();
      expect(m.ack).toHaveBeenCalledOnce();
      expect(m.retry).not.toHaveBeenCalled();
      expect(mocks.prismaMock.$disconnect).toHaveBeenCalledOnce();
    });

    it('retries a message that fails but keeps processing the batch', async () => {
      const m1 = makeMessage('job-fail');
      const m2 = makeMessage('job-ok');
      mocks.processQueueJob
        .mockRejectedValueOnce(new Error('provider down'))
        .mockResolvedValueOnce(undefined);

      await workerHandler.queue({ messages: [m1, m2] } as never, env() as never);

      expect(m1.retry).toHaveBeenCalledOnce();
      expect(m1.ack).not.toHaveBeenCalled();
      expect(m2.ack).toHaveBeenCalledOnce();
      expect(mocks.prismaMock.$disconnect).toHaveBeenCalledOnce();
    });
  });
});
