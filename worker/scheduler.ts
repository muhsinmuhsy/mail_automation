import { createPrisma } from '../lib/db/prisma';
import { scheduleDueJobs, recoverStuckJobs } from '../lib/jobs/scheduler';

export async function handleScheduled(event: ScheduledEvent, env: Env) {
  const prisma = createPrisma(env.DATABASE_URL);
  try {
    await recoverStuckJobs(prisma);
    await scheduleDueJobs(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
