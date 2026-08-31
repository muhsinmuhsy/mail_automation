import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { NotFoundError, ValidationError } from '@/lib/errors';

const _POST = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const account = await getPrisma().emailAccount.findUnique({
    where: { id: parsed.data.id },
  });

  if (!account) {
    return respondError(new NotFoundError('Email account not found.'), ctx.requestId);
  }

  await getPrisma().emailAccount.update({
    where: { id: parsed.data.id },
    data: { is_active: true },
  });

  return respondOk(null, ctx.requestId, 'Email account reactivated.');
}, {
  auth: {
    ownership: async (params) => {
      const acc = await getPrisma().emailAccount.findUnique({
        where: { id: params.id },
        select: { user_id: true },
      });
      if (!acc) throw new NotFoundError('Email account not found.');
      return acc.user_id;
    },
  },
  rateLimitKey: 'email-account-reactivate',
});


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
