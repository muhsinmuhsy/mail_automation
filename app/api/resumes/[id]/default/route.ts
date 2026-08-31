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

  const resume = await getPrisma().resume.findUnique({
    where: { id: parsed.data.id },
  });
  if (!resume || resume.deleted_at) {
    return respondError(new NotFoundError('Resume not found.'), ctx.requestId);
  }

  await getPrisma().$transaction([
    getPrisma().resume.updateMany({
      where: { user_id: resume.user_id, deleted_at: null },
      data: { is_default: false },
    }),
    getPrisma().resume.update({ where: { id: resume.id }, data: { is_default: true } }),
  ]);

  return respondOk(null, ctx.requestId, 'Default resume set.');
}, {
  auth: {
    ownership: async (params) => {
      const r = await getPrisma().resume.findUnique({
        where: { id: params.id },
        select: { user_id: true, deleted_at: true },
      });
      if (!r || r.deleted_at) throw new NotFoundError('Resume not found.');
      return r.user_id;
    },
  },
  rateLimitKey: 'resume-default',
});


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
