import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondOk } from '@/lib/api/respond';

const _GET = defineRoute(async (_req, ctx) => {
  const users = await getPrisma().user.count();
  const settings = await getPrisma().systemSetting.findUnique({ where: { id: 1 } });

  return respondOk({ totalUsers: users, settings }, ctx.requestId);
}, { auth: 'admin' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}
