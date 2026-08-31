import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { ValidationError, NotFoundError, ForbiddenError } from '@/lib/errors';
import { idParamSchema } from '@/lib/validation/common';
import { adminUpdateUserSchema } from '@/lib/validation/admin';

const _GET = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const user = await getPrisma().user.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, email: true, name: true, role: true, is_active: true, daily_email_limit_override: true, created_at: true },
  });

  if (!user) {
    return respondError(new NotFoundError('User not found.'), ctx.requestId);
  }

  return respondOk(user, ctx.requestId);
}, { auth: 'admin' });

const _PATCH = defineRoute(async (req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const body = await req.json();
  const updateParsed = adminUpdateUserSchema.safeParse(body);
  if (!updateParsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(updateParsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  const targetUser = await getPrisma().user.findUnique({ where: { id: parsed.data.id } });
  if (!targetUser) {
    return respondError(new NotFoundError('User not found.'), ctx.requestId);
  }

  if (targetUser.role === 'ADMIN' && targetUser.id === ctx.user.id && updateParsed.data.is_active === false) {
    return respondError(new ForbiddenError('Cannot disable the last active admin.'), ctx.requestId);
  }

  const updated = await getPrisma().user.update({
    where: { id: parsed.data.id },
    data: {
      is_active: updateParsed.data.is_active ?? targetUser.is_active,
      daily_email_limit_override: updateParsed.data.daily_email_limit_override ?? targetUser.daily_email_limit_override,
    },
    select: { id: true, email: true, name: true, role: true, is_active: true, daily_email_limit_override: true },
  });

  return respondOk(updated, ctx.requestId, 'User updated.');
}, { auth: 'admin', rateLimitKey: 'admin-user-update' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}


export async function PATCH(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _PATCH(req, ctx);
}
