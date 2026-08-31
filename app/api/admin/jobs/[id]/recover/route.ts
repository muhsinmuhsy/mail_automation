import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { adminRecoverJobSchema } from '@/lib/validation/admin';
import { resolveDeliveryUnknown } from '@/lib/limits/email-limit-service';
import { NotFoundError, ValidationError } from '@/lib/errors';

const DECISION_STATUS: Record<'sent' | 'failed' | 'unknown', string> = {
  sent: 'SENT',
  failed: 'FAILED',
  unknown: 'DELIVERY_UNKNOWN',
};

const _POST = defineRoute(async (req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const body = await req.json().catch(() => null);
  const decisionParsed = adminRecoverJobSchema.safeParse(body);
  if (!decisionParsed.success) {
    return respondError(
      new ValidationError(
        'decision must be one of "sent", "failed", or "unknown".',
        Object.fromEntries(decisionParsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  const job = await getPrisma().emailJob.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, status: true, user_id: true, campaign_id: true },
  });
  if (!job) {
    return respondError(new NotFoundError('Email job not found.'), ctx.requestId);
  }

  const decision = await resolveDeliveryUnknown(getPrisma(), {
    emailJobId: job.id,
    userId: job.user_id,
    campaignId: job.campaign_id,
    decision: decisionParsed.data.decision,
  });

  return respondOk(
    { id: job.id, decision, status: DECISION_STATUS[decision] },
    ctx.requestId,
    decision === 'unknown'
      ? 'Job left in DELIVERY_UNKNOWN for later review.'
      : `Job marked ${DECISION_STATUS[decision]}.`
  );
}, { auth: 'admin', rateLimitKey: 'admin-job-recover' });


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
