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
  if (campaign.status === 'CANCELLED') {
    return respondError(
      new AppError('Cannot retry emails from a cancelled campaign.', 409, 'BUSINESS_ERROR'),
      ctx.requestId
    );
  }

  const result = await getPrisma().emailJob.updateMany({
    where: { campaign_id: parsed.data.id, status: 'FAILED' },
    data: {
      status: 'SCHEDULED',
      attempt_count: 0,
      error_message: null,
      processing_started_at: null,
      next_attempt_at: null,
    },
  });

  if (result.count > 0 && campaign.status === 'COMPLETED') {
    await getPrisma().campaign.updateMany({
      where: { id: parsed.data.id, status: 'COMPLETED' },
      data: { status: 'ACTIVE' },
    });
  }

  if (result.count === 0) {
    return respondError(
      new AppError('No failed emails to retry in this campaign.', 409, 'BUSINESS_ERROR'),
      ctx.requestId
    );
  }

  return respondOk({ retriedCount: result.count }, ctx.requestId, `${result.count} email${result.count === 1 ? '' : 's'} queued for retry.`);
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
  rateLimitKey: 'campaign-retry-failed',
});


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
