// @ts-expect-error .open-next/worker.js is generated at build time
import handler from './.open-next/worker.js';

import { createPrisma } from '../lib/db/prisma';
import { processQueueJob } from '../lib/jobs/consumer';
import { scheduleDueJobs, recoverStuckJobs } from '../lib/jobs/scheduler';
import { recoverReservations } from '../lib/limits/email-limit-service';

type QueueEnv = Record<string, unknown> & {
  EMAIL_QUEUE?: { send: (msg: { body: unknown }) => Promise<void>; sendBatch: (msgs: { body: unknown }[]) => Promise<void> };
};

const workerHandler = {
  fetch: handler.fetch,

  async scheduled(event: ScheduledEvent, env: Record<string, unknown>) {
    const prisma = createPrisma(env.DATABASE_URL as string);
    try {
      await recoverStuckJobs(prisma);
      await recoverReservations(prisma, { stuckMinutes: 15 });
      const dueIds = await scheduleDueJobs(prisma);
      const queue = (env as QueueEnv).EMAIL_QUEUE;
      if (queue && dueIds.length > 0) {
        await queue.sendBatch(dueIds.map((id) => ({ body: { jobId: id } })));
      }
    } finally {
      await prisma.$disconnect();
    }
  },

  async queue(batch: MessageBatch, env: Record<string, unknown>) {
    const prisma = createPrisma(env.DATABASE_URL as string);
    for (const message of batch.messages) {
      const jobId = (message.body as { jobId?: string } | undefined)?.jobId;
      if (!jobId) {
        message.ack();
        continue;
      }
      try {
        await processQueueJob(prisma, env, jobId);
        message.ack();
      } catch {
        message.retry();
      }
    }
    await prisma.$disconnect();
  },
};

export default workerHandler;

declare global {
  interface Env {
    DATABASE_URL: string;
    EMAIL_QUEUE: Queue;
    SMTP_ENCRYPTION_KEY?: string;
    B2_BUCKET_NAME: string;
    B2_REGION: string;
    B2_ENDPOINT: string;
    B2_KEY_ID: string;
    B2_APPLICATION_KEY: string;
  }
}
