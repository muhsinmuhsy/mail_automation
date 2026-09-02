import { createPrisma } from '../lib/db/prisma';
import { processQueueJob } from '../lib/jobs/consumer';
import { scheduleDueJobs, recoverStuckJobs, completeFinishedCampaigns } from '../lib/jobs/scheduler';
import { recoverReservations } from '../lib/limits/email-limit-service';

type QueueEnv = Record<string, unknown> & {
  EMAIL_QUEUE?: { send: (msg: { body: unknown }) => Promise<void>; sendBatch: (msgs: { body: unknown }[]) => Promise<void> };
};

const workerHandler = {
  fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return Response.json({ status: 'ok', service: 'mail-automation-worker' });
    }

    return Response.json(
      {
        success: false,
        error: {
          type: 'NOT_FOUND',
          message: 'This Cloudflare Worker only handles background automation.',
        },
      },
      { status: 404 }
    );
  },

  async scheduled(event: ScheduledEvent, env: Record<string, unknown>) {
    const prisma = createPrisma(env.DATABASE_URL as string);
    try {
      await recoverStuckJobs(prisma);
      await recoverReservations(prisma, { stuckMinutes: 15 });

      // Emergency kill switch: when global sending is disabled, Cron must not
      // enqueue new jobs. Stuck-job and reservation recovery above still run so
      // the system self-heals when sending is re-enabled.
      const settings = await prisma.systemSetting.findUnique({ where: { id: 1 } });
      const sendingEnabled = settings ? settings.email_sending_enabled : true;

      if (sendingEnabled) {
        const dueIds = await scheduleDueJobs(prisma);
        const queue = (env as QueueEnv).EMAIL_QUEUE;
        if (queue && dueIds.length > 0) {
          await queue.sendBatch(dueIds.map((id) => ({ body: { jobId: id } })));
        }
      }

      await completeFinishedCampaigns(prisma);
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
