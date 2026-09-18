import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { getCampaignDailyUsage } from '@/lib/limits/email-limit-service';
import { completeFinishedCampaigns } from '@/lib/jobs/scheduler';
import { toStatusCounts } from '@/lib/campaigns/status-counts';

const _GET = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const prisma = getPrisma();
  await completeFinishedCampaigns(prisma);
  const [campaign, usageToday] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: parsed.data.id },
      include: {
        _count: { select: { email_jobs: true } },
        template: { select: { id: true, name: true, subject: true } },
        email_account: { select: { id: true, email: true, provider: true } },
        email_jobs: {
          select: { id: true, to_email: true, status: true, scheduled_at: true, sent_at: true, error_message: true, next_attempt_at: true },
          orderBy: [{ scheduled_at: 'asc' }, { id: 'asc' }],
          take: 100,
        },
      },
    }),
    getCampaignDailyUsage(prisma, parsed.data.id),
  ]);

  if (!campaign) {
    return respondError(new NotFoundError('Campaign not found.'), ctx.requestId);
  }

  const statusRows = await prisma.emailJob.groupBy({
    by: ['status'],
    where: { campaign_id: parsed.data.id },
    _count: true,
  });

  return respondOk({ ...campaign, status_counts: toStatusCounts(statusRows), usageToday }, ctx.requestId);
}, {
  auth: {
    ownership: async (params) => {
      const c = await getPrisma().campaign.findUnique({
        where: { id: params.id },
        select: { user_id: true },
      });
      if (!c) throw new NotFoundError('Campaign not found.');
      return c.user_id;
    },
  },
});


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}
