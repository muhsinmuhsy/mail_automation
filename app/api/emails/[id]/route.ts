import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { NotFoundError, ValidationError } from '@/lib/errors';

const _GET = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const emailJob = await getPrisma().emailJob.findUnique({
    where: { id: parsed.data.id },
    include: { email_logs: true },
  });

  if (!emailJob) {
    return respondError(new NotFoundError('Email not found.'), ctx.requestId);
  }

  return respondOk(emailJob, ctx.requestId);
}, {
  auth: {
    ownership: async (params) => {
      const j = await getPrisma().emailJob.findUnique({
        where: { id: params.id },
        select: { user_id: true },
      });
      if (!j) throw new NotFoundError('Email not found.');
      return j.user_id;
    },
  },
});


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}
