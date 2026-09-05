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

  const attachment = await getPrisma().attachment.findUnique({
    where: { id: parsed.data.id },
  });
  if (!attachment || attachment.deleted_at) {
    return respondError(new NotFoundError('Attachment not found.'), ctx.requestId);
  }

  await getPrisma().$transaction([
    getPrisma().attachment.updateMany({
      where: { user_id: attachment.user_id, deleted_at: null },
      data: { is_default: false },
    }),
    getPrisma().attachment.update({ where: { id: attachment.id }, data: { is_default: true } }),
  ]);

  return respondOk(null, ctx.requestId, 'Default attachment set.');
}, {
  auth: {
    ownership: async (params) => {
      const r = await getPrisma().attachment.findUnique({
        where: { id: params.id },
        select: { user_id: true, deleted_at: true },
      });
      if (!r || r.deleted_at) throw new NotFoundError('Attachment not found.');
      return r.user_id;
    },
  },
  rateLimitKey: 'attachment-default',
});


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
