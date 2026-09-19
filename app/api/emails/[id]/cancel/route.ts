import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';

const CANCELLABLE_STATUSES = ['SCHEDULED', 'QUEUED', 'RETRY_WAIT'] as const;

const _POST = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const job = await getPrisma().emailJob.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, status: true, campaign_id: true },
  });

  if (!job) {
    return respondError(new NotFoundError('Email not found.'), ctx.requestId);
  }
  if (!(CANCELLABLE_STATUSES as readonly string[]).includes(job.status)) {
    return respondError(
      new AppError('Only scheduled, queued, or waiting emails can be cancelled.', 409, 'BUSINESS_ERROR'),
      ctx.requestId
    );
  }

  if (job.campaign_id) {
    const campaign = await getPrisma().campaign.findUnique({
      where: { id: job.campaign_id },
      select: { status: true },
    });
    if (campaign?.status === 'CANCELLED') {
      return respondError(
        new AppError('Cannot cancel an email from a cancelled campaign.', 409, 'BUSINESS_ERROR'),
        ctx.requestId
      );
    }
  }

  await getPrisma().emailJob.update({
    where: { id: parsed.data.id },
    data: {
      status: 'CANCELLED',
      next_attempt_at: null,
      processing_started_at: null,
    },
  });

  return respondOk(null, ctx.requestId, 'Email cancelled.');
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
  rateLimitKey: 'email-retry',
});


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
