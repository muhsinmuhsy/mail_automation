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

  const job = await getPrisma().emailJob.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, status: true, campaign_id: true },
  });

  if (!job) {
    return respondError(new NotFoundError('Email not found.'), ctx.requestId);
  }
  if (job.status !== 'FAILED' && job.status !== 'RETRY_WAIT') {
    return respondError(
      new AppError('Only failed or waiting emails can be retried.', 409, 'BUSINESS_ERROR'),
      ctx.requestId
    );
  }

  let campaignStatus: string | null = null;
  let campaignId: string | null = null;
  if (job.campaign_id) {
    campaignId = job.campaign_id;
    const campaign = await getPrisma().campaign.findUnique({
      where: { id: job.campaign_id },
      select: { status: true },
    });
    campaignStatus = campaign?.status ?? null;
    if (campaignStatus === 'CANCELLED') {
      return respondError(
        new AppError('Cannot retry an email from a cancelled campaign.', 409, 'BUSINESS_ERROR'),
        ctx.requestId
      );
    }
  }

  await getPrisma().emailJob.update({
    where: { id: parsed.data.id },
    data: {
      status: 'SCHEDULED',
      attempt_count: 0,
      error_message: null,
      processing_started_at: null,
      next_attempt_at: null,
    },
  });

  if (campaignId && campaignStatus === 'COMPLETED') {
    await getPrisma().campaign.updateMany({
      where: { id: campaignId, status: 'COMPLETED' },
      data: { status: 'ACTIVE' },
    });
  }

  return respondOk(null, ctx.requestId, 'Email queued for retry.');
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
