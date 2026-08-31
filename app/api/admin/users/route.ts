import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondOk } from '@/lib/api/respond';

const _GET = defineRoute(async (_req, ctx) => {
  const users = await getPrisma().user.findMany({
    select: { id: true, email: true, name: true, role: true, is_active: true, daily_email_limit_override: true, created_at: true },
    orderBy: { created_at: 'desc' },
  });

  return respondOk(users, ctx.requestId);
}, { auth: 'admin' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}
