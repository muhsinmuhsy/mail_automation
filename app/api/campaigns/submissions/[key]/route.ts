import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { submissionKeyParamSchema } from '@/lib/validation/campaign';
import { ValidationError, NotFoundError } from '@/lib/errors';

/**
 * GET /api/campaigns/submissions/[key] (§5.5).
 *
 * Required authenticated lookup for durable submission recovery after a lost
 * response. Returns the committed campaign identity and recipient summary,
 * or 404 if no submission exists for this key yet.
 */
const _GET = defineRoute(async (_req, ctx) => {
  const parsed = submissionKeyParamSchema.safeParse(ctx.params);
  if (!parsed.success) {
    return respondError(
      new ValidationError('Invalid submission key.'),
      ctx.requestId
    );
  }

  const submission = await getPrisma().campaignSubmission.findUnique({
    where: {
      user_id_idempotency_key: {
        user_id: ctx.user.id,
        idempotency_key: parsed.data.key,
      },
    },
    select: {
      campaign_id: true,
      recipient_summary: true,
      created_at: true,
      campaign: { select: { name: true } },
    },
  });

  if (!submission) {
    return respondError(
      new NotFoundError('No submission found for this key.'),
      ctx.requestId
    );
  }

  const response = respondOk(
    {
      campaignId: submission.campaign_id,
      campaignName: submission.campaign.name,
      recipientSummary: submission.recipient_summary,
      createdAt: submission.created_at.toISOString(),
    },
    ctx.requestId
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}, { auth: 'user', rateLimitKey: 'campaign-submission-status' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}
