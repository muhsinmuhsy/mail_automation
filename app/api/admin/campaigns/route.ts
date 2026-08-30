import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guards';
import { respondError, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';

const CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    await requireAdmin();

    const { page, limit, search } = parseListQuery(request, { search: true });
    const { searchParams } = new URL(request.url);
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

    return respondList(campaigns, total, page, limit, requestId);
  } catch (err) {
    return respondError(err, requestId);
  }
}
