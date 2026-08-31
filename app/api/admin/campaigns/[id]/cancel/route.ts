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

  const campaign = await getPrisma().campaign.findUnique({ where: { id: parsed.data.id } });
  if (!campaign) {
    return respondError(new NotFoundError('Campaign not found.'), ctx.requestId);
  }

  await getPrisma().campaign.update({
    where: { id: parsed.data.id },
    data: { status: 'CANCELLED' },
  });

  return respondOk(null, ctx.requestId, 'Campaign cancelled.');
}, { auth: 'admin', rateLimitKey: 'admin-campaign-cancel' });


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
