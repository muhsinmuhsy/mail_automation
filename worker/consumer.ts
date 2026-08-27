import { createPrisma } from '../lib/db/prisma';
import { processQueueJob } from '../lib/jobs/consumer';

export async function handleQueue(batch: MessageBatch, env: Record<string, unknown>, ctx: ExecutionContext) {
  const prisma = createPrisma(env.DATABASE_URL as string);
  for (const message of batch.messages) {
    try {
      await processQueueJob(prisma, env, message.id);
      message.ack();
    } catch {
      message.retry();
    }
  }
  await prisma.$disconnect();
}
