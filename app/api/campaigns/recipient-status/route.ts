import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { recipientStatusSchema } from '@/lib/validation/campaign';
import { ValidationError, ForbiddenError } from '@/lib/errors';
import { computeRecipientStatus } from '@/lib/campaigns/eligibility';
import { POLICY_VERSION } from '@/lib/campaigns/policy';

/**
 * POST /api/campaigns/recipient-status (§5.4).
 *
 * Read-only endpoint for row-level badges on visible contacts. Returns
 * historical classifications (ELIGIBLE/PREVIOUSLY_SENT/PENDING/DELIVERY_UNKNOWN)
 * for at most 100 contact IDs. Not an authoritative selection count — the
 * pre-check endpoint is the single source for that.
 */
const _POST = defineRoute(async (req, ctx) => {
  const body = await req.json();
  const parsed = recipientStatusSchema.safeParse(body);
  if (!parsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  const { templateId, emailAccountId, contactIds } = parsed.data;

  // Validate ownership of template and email account.
  const [template, emailAccount] = await Promise.all([
    getPrisma().template.findFirst({
      where: { id: templateId, user_id: ctx.user.id },
      select: { id: true },
    }),
    getPrisma().emailAccount.findFirst({
      where: { id: emailAccountId, user_id: ctx.user.id },
      select: { id: true },
    }),
  ]);

  if (!template) {
    return respondError(
      new ForbiddenError('Template not found or does not belong to you.'),
      ctx.requestId
    );
  }
  if (!emailAccount) {
    return respondError(
      new ForbiddenError('Email account not found or does not belong to you.'),
      ctx.requestId
    );
  }

  // Validate contact ownership.
  const contactCount = await getPrisma().contact.count({
    where: { id: { in: contactIds }, user_id: ctx.user.id },
  });
  if (contactCount !== contactIds.length) {
    return respondError(
      new ForbiddenError('One or more contacts do not belong to you.'),
      ctx.requestId
    );
  }

  const statuses = await computeRecipientStatus(
    getPrisma(),
    ctx.user.id,
    templateId,
    emailAccountId,
    contactIds
  );

  const response = respondOk(
    { policyVersion: POLICY_VERSION, statuses },
    ctx.requestId
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}, { auth: 'user', rateLimitKey: 'campaign-pre-check' });


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
