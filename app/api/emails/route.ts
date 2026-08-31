import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';

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
  const { page, limit, search } = parseListQuery(req, { search: true });

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const statusFilter =
    statusParam && (EMAIL_JOB_STATUSES as readonly string[]).includes(statusParam)
      ? { status: statusParam as (typeof EMAIL_JOB_STATUSES)[number] }
      : {};

  const where = {
    user_id: ctx.user.id,
    ...statusFilter,
    ...(search ? { to_email: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [emails, total] = await Promise.all([
    getPrisma().emailJob.findMany({
      where,
      select: { id: true, to_email: true, subject: true, status: true, sent_at: true, created_at: true },
      orderBy: { created_at: 'desc' },
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
