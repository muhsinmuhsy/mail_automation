import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guards';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { adminRecoverJobSchema } from '@/lib/validation/admin';
import { resolveDeliveryUnknown } from '@/lib/limits/email-limit-service';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { NotFoundError, ValidationError } from '@/lib/errors';

const DECISION_STATUS: Record<'sent' | 'failed' | 'unknown', string> = {
  sent: 'SENT',
  failed: 'FAILED',
  unknown: 'DELIVERY_UNKNOWN',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  try {
    const { sessionUser } = await requireAdmin();

    const rateLimitResult = await checkApiRateLimit(request, sessionUser.id, 'admin-job-recover');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const body = await request.json().catch(() => null);
    const decisionParsed = adminRecoverJobSchema.safeParse(body);
    if (!decisionParsed.success) {
      return respondError(
        new ValidationError(
          'decision must be one of "sent", "failed", or "unknown".',
          Object.fromEntries(decisionParsed.error.errors.map((e) => [e.path.join('.'), e.message]))
        ),
        requestId
      );
    }

    const job = await getPrisma().emailJob.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, status: true, user_id: true, campaign_id: true },
    });
    if (!job) {
      return respondError(new NotFoundError('Email job not found.'), requestId);
    }

    const decision = await resolveDeliveryUnknown(getPrisma(), {
      emailJobId: job.id,
      userId: job.user_id,
      campaignId: job.campaign_id,
      decision: decisionParsed.data.decision,
    });

    return respondOk(
      { id: job.id, decision, status: DECISION_STATUS[decision] },
      requestId,
      decision === 'unknown'
        ? 'Job left in DELIVERY_UNKNOWN for later review.'
        : `Job marked ${DECISION_STATUS[decision]}.`
    );
  } catch (err) {
    return respondError(err, requestId);
  }
}
