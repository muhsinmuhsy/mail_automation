import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';

const CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;

const _GET = defineRoute(async (req, ctx) => {
  const { page, limit, search } = parseListQuery(req, { search: true });
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const statusFilter =
    statusParam && (CAMPAIGN_STATUSES as readonly string[]).includes(statusParam)
      ? { status: statusParam as (typeof CAMPAIGN_STATUSES)[number] }
      : {};

  const where = {
    ...statusFilter,
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [campaigns, total] = await Promise.all([
    getPrisma().campaign.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        created_at: true,
        user: { select: { email: true } },
      },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    getPrisma().campaign.count({ where }),
  ]);

  return respondList(campaigns, total, page, limit, ctx.requestId);
}, { auth: 'admin' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}
