import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';

const _POST = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const campaign = await getPrisma().campaign.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, status: true },
  });

  if (!campaign) {
    return respondError(new NotFoundError('Campaign not found.'), ctx.requestId);
  }
  if (campaign.status !== 'ACTIVE') {
    return respondError(
      new AppError('Only active campaigns can be paused.', 409, 'BUSINESS_ERROR'),
      ctx.requestId
    );
  }

  const result = await getPrisma().campaign.updateMany({
    where: { id: parsed.data.id, status: 'ACTIVE' },
    data: { status: 'PAUSED' },
  });

  if (result.count === 0) {
    return respondError(new NotFoundError('Campaign not found.'), ctx.requestId);
  }

  return respondOk(null, ctx.requestId, 'Campaign paused.');
}, {
  auth: {
    ownership: async (params) => {
      const c = await getPrisma().campaign.findUnique({
        where: { id: params.id },
        select: { user_id: true },
      });
      if (!c) throw new NotFoundError('Campaign not found.');
      return c.user_id;
    },
  },
  rateLimitKey: 'campaign-pause',
});


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
