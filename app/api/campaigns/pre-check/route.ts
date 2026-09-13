import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { preCheckSchema } from '@/lib/validation/campaign';
import { ValidationError, ForbiddenError } from '@/lib/errors';
import { computeEligibility } from '@/lib/campaigns/eligibility';
import { computePreviewFingerprint } from '@/lib/campaigns/fingerprint';
import { logger } from '@/lib/logging/logger';

/**
 * Campaign pre-check endpoint (§5.2).
 *
 * Returns the full eligibility summary: selected/eligible/excluded counts,
 * per-recipient classification, missing values, unknown tokens, and a preview
 * fingerprint for creation-time freshness validation.
 */
const _POST = defineRoute(async (req, ctx) => {
  const body = await req.json();
  const parsed = preCheckSchema.safeParse(body);
  if (!parsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  const {
    templateId,
    emailAccountId,
    contactIds,
    attachmentIds,
    resendRecipients,
    missingValueAction,
    unknownTokenAction,
    startAt,
    intervalMinutes,
    dailyLimit,
  } = parsed.data;

  // Validate ownership of template and email account.
  const [template, emailAccount] = await Promise.all([
    getPrisma().template.findFirst({
      where: { id: templateId, user_id: ctx.user.id },
      select: { id: true, subject: true, body: true, body_text: true, body_html: true },
    }),
    getPrisma().emailAccount.findFirst({
      where: { id: emailAccountId, user_id: ctx.user.id, is_active: true },
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
      new ForbiddenError('Email account not found or is not active.'),
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

  // Compute eligibility.
  const eligibility = await computeEligibility(getPrisma(), {
    userId: ctx.user.id,
    templateId,
    emailAccountId,
    contactIds,
    attachmentIds,
    resendRecipients,
    missingValueAction,
    unknownTokenAction,
    startAt: startAt ?? new Date(),
    timezone: parsed.data.timezone,
    intervalMinutes,
    dailyLimit: dailyLimit ?? null,
  });

  // Compute preview fingerprint.
  const previewFingerprint = await computePreviewFingerprint({
    templateId,
    emailAccountId,
    attachmentIds,
    contactIds,
    resendRecipients,
    missingValueAction,
    unknownTokenAction,
    eligibleRecipients: eligibility.preparedJobs.map((job) => ({
      contactId: job.contactId,
      recipientEmail: job.toEmail,
      subject: job.subject,
      bodyText: job.body,
      bodyHtml: job.bodyHtml,
    })),
    includedPreviousCount: eligibility.summary.includedPreviousCount,
    includedWithoutPreviousSendCount: eligibility.summary.includedWithoutPreviousSendCount,
    followUpSentJobIds: [],
  });

  const response = respondOk(
    {
      ...eligibility.summary,
      previewFingerprint,
    },
    ctx.requestId
  );
  response.headers.set('Cache-Control', 'private, no-store');

  logger.info('campaign:pre-check', {
    requestId: ctx.requestId,
    policyVersion: eligibility.summary.policyVersion,
    selectedCount: eligibility.summary.selectedCount,
    eligibleCount: eligibility.summary.eligibleCount,
    excludedCount: eligibility.summary.excludedCount,
    blockedByUnknownTokens: eligibility.summary.blockedByUnknownTokens,
  });

  return response;
}, { auth: 'user', rateLimitKey: 'campaign-pre-check' });


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
