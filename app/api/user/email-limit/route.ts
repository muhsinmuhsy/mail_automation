import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondOk } from '@/lib/api/respond';
import { getUserDailyUsage } from '@/lib/limits/email-limit-service';

const _GET = defineRoute(async (_req, ctx) => {
  const usage = await getUserDailyUsage(getPrisma(), ctx.user.id);
  return respondOk({
    dailyEmailLimit: usage.limit,
    sentToday: usage.sent,
    reservedToday: usage.reserved,
    remaining: usage.remaining,
  }, ctx.requestId);
}, { auth: 'user' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}
