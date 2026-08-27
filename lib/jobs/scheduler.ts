import { PrismaClient } from '../generated/prisma/client';

export async function scheduleDueJobs(prisma: PrismaClient): Promise<string[]> {
  const dueJobs = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE email_jobs
    SET status = 'QUEUED', updated_at = now()
    WHERE id IN (
      SELECT id FROM email_jobs
      WHERE
        (status = 'SCHEDULED' AND scheduled_at <= now())
        OR (status = 'RETRY_WAIT' AND next_attempt_at <= now())
      ORDER BY COALESCE(next_attempt_at, scheduled_at)
      LIMIT 100
    )
    AND status IN ('SCHEDULED', 'RETRY_WAIT')
    RETURNING id
  `;

  return dueJobs.map((row: { id: string }) => row.id);
}

export async function recoverStuckJobs(prisma: PrismaClient): Promise<void> {
  const threshold = new Date();
  threshold.setUTCMinutes(threshold.getUTCMinutes() - 10);

  await prisma.emailJob.updateMany({
    where: {
      status: 'PROCESSING',
      processing_started_at: { lt: threshold },
    },
    data: {
      status: 'DELIVERY_UNKNOWN',
      error_message: 'Job was stuck in processing for more than 10 minutes.',
    },
  });
}
