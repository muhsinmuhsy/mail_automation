import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondList } from '@/lib/api/respond';
import { parseListQuery, dateRangeWhere } from '@/lib/api/list';

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
  const { page, limit, search, sortBy, sortOrder, startDate, endDate } = parseListQuery(req, { search: true, sortable: ['created_at'], dateRange: true });

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const statusFilter =
    statusParam && (EMAIL_JOB_STATUSES as readonly string[]).includes(statusParam)
      ? { status: statusParam as (typeof EMAIL_JOB_STATUSES)[number] }
      : {};

  const where = {
    user_id: ctx.user.id,
    ...statusFilter,
    ...dateRangeWhere('created_at', startDate, endDate),
    ...(search ? { to_email: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [emails, total] = await Promise.all([
    getPrisma().emailJob.findMany({
      where,
      select: { id: true, to_email: true, subject: true, status: true, sent_at: true, created_at: true, scheduled_at: true, next_attempt_at: true, error_message: true, campaign: { select: { timezone: true, name: true } } },
      orderBy: { [sortBy ?? 'created_at']: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    getPrisma().emailJob.count({ where }),
  ]);

  return respondList(emails, total, page, limit, ctx.requestId);
}, { auth: 'user' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}
