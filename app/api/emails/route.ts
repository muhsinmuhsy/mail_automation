import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondList } from '@/lib/api/respond';
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

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();
    const { page, limit, search } = parseListQuery(request, { search: true });

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const statusFilter =
      statusParam && (EMAIL_JOB_STATUSES as readonly string[]).includes(statusParam)
        ? { status: statusParam as (typeof EMAIL_JOB_STATUSES)[number] }
        : {};

    const where = {
      user_id: user.id,
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

    return respondList(emails, total, page, limit, requestId);
  } catch (err) {
    return respondError(err, requestId);
  }
}
