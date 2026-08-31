import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { ValidationError, NotFoundError, ForbiddenError } from '@/lib/errors';
import { idParamSchema } from '@/lib/validation/common';

const _POST = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const targetUser = await getPrisma().user.findUnique({ where: { id: parsed.data.id } });
  if (!targetUser) {
    return respondError(new NotFoundError('User not found.'), ctx.requestId);
  }

  if (targetUser.role === 'ADMIN' && targetUser.id === ctx.user.id) {
    return respondError(new ForbiddenError('Cannot disable your own admin account.'), ctx.requestId);
  }

  await getPrisma().user.update({
    where: { id: parsed.data.id },
    data: { is_active: false },
  });

  return respondOk(null, ctx.requestId, 'User disabled.');
}, { auth: 'admin', rateLimitKey: 'admin-user-disable' });


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
