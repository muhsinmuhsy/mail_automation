import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { getCampaignDailyUsage } from '@/lib/limits/email-limit-service';
import { completeFinishedCampaigns } from '@/lib/jobs/scheduler';
import { toStatusCounts } from '@/lib/campaigns/status-counts';
import { parseListQuery } from '@/lib/api/list';
import { listMeta } from '@/lib/api/list';

const EMAIL_JOB_STATUSES = [
  'SCHEDULED',
  'QUEUED',
  'PROCESSING',
  'RETRY_WAIT',
  'SENT',
  'FAILED',
  'CANCELLED',
  'DELIVERY_UNKNOWN',
] as const;

const _GET = defineRoute(async (req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const { page, limit, search } = parseListQuery(req, { search: true });

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const statusFilter =
    statusParam && (EMAIL_JOB_STATUSES as readonly string[]).includes(statusParam)
      ? { status: statusParam as (typeof EMAIL_JOB_STATUSES)[number] }
      : {};

  const prisma = getPrisma();
  await completeFinishedCampaigns(prisma);

  const [campaign, usageToday] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: parsed.data.id },
      include: {
        _count: { select: { email_jobs: true } },
        template: { select: { id: true, name: true, subject: true } },
        email_account: { select: { id: true, email: true, provider: true } },
      },
    }),
    getCampaignDailyUsage(prisma, parsed.data.id),
  ]);

  if (!campaign) {
    return respondError(new NotFoundError('Campaign not found.'), ctx.requestId);
  }

  const jobsWhere = {
    campaign_id: parsed.data.id,
    ...statusFilter,
    ...(search ? { to_email: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [email_jobs, jobsTotal, statusRows] = await Promise.all([
    prisma.emailJob.findMany({
      where: jobsWhere,
      select: { id: true, to_email: true, status: true, scheduled_at: true, sent_at: true, error_message: true, next_attempt_at: true },
      orderBy: [{ scheduled_at: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.emailJob.count({ where: jobsWhere }),
    prisma.emailJob.groupBy({
      by: ['status'],
      where: { campaign_id: parsed.data.id },
      _count: true,
    }),
  ]);

  return respondOk(
    {
      ...campaign,
      email_jobs,
      emailJobsPagination: listMeta(jobsTotal, page, limit),
      status_counts: toStatusCounts(statusRows),
      usageToday,
    },
    ctx.requestId
  );
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
