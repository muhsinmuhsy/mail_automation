// @ts-expect-error .open-next/worker.js is generated at build time
import handler from './.open-next/worker.js';

import { createPrisma } from '../lib/db/prisma';
import { processQueueJob } from '../lib/jobs/consumer';
import { scheduleDueJobs, recoverStuckJobs } from '../lib/jobs/scheduler';

export default {
  fetch: handler.fetch,

  async scheduled(event: ScheduledEvent, env: Record<string, unknown>, ctx: ExecutionContext) {
    const prisma = createPrisma(env.DATABASE_URL as string);
    try {
      await recoverStuckJobs(prisma);
      await scheduleDueJobs(prisma);
    } finally {
      await prisma.$disconnect();
    }
  },

  async queue(batch: MessageBatch, env: Record<string, unknown>, ctx: ExecutionContext) {
    const prisma = createPrisma(env.DATABASE_URL as string);
    for (const message of batch.messages) {
      try {
        await processQueueJob(prisma, env, message.id);
        message.ack();
      } catch (error) {
        message.retry();
      }
    }
    await prisma.$disconnect();
  },
};

declare global {
  interface Env {
    DATABASE_URL: string;
    R2_BUCKET: R2Bucket;
    EMAIL_QUEUE: Queue;
  }
}
