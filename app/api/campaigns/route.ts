import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery, dateRangeWhere } from '@/lib/api/list';
import {
  createCampaignSchema,
  UNSUPPORTED_CREATION_FIELDS,
} from '@/lib/validation/campaign';
import { createCampaign } from '@/lib/campaigns/create';
import { ValidationError, ForbiddenError, UnsupportedFieldError } from '@/lib/errors';
import { attachmentSelectionError } from '@/lib/email/attachment-limits';
import { completeFinishedCampaigns } from '@/lib/jobs/scheduler';

const CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;

const _GET = defineRoute(async (req, ctx) => {
  const { page, limit, search, startDate, endDate } = parseListQuery(req, { search: true, dateRange: true });

  const prisma = getPrisma();
  await completeFinishedCampaigns(prisma);

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const statusFilter =
    statusParam && (CAMPAIGN_STATUSES as readonly string[]).includes(statusParam)
      ? { status: statusParam as (typeof CAMPAIGN_STATUSES)[number] }
      : {};

  const where = {
    user_id: ctx.user.id,
    ...statusFilter,
    ...dateRangeWhere('created_at', startDate, endDate),
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      select: { _count: { select: { email_jobs: true } }, id: true, name: true, status: true, created_at: true, start_at: true, timezone: true, interval_minutes: true, daily_limit: true },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.campaign.count({ where }),
  ]);

  return respondList(campaigns, total, page, limit, ctx.requestId);
}, { auth: 'user' });

const _POST = defineRoute(async (req, ctx) => {
  const body = await req.json();

  // Reject unsupported fields (§5.3).
  if (body && typeof body === 'object') {
    const presentUnsupported = UNSUPPORTED_CREATION_FIELDS.filter(
      (field) => field in (body as Record<string, unknown>)
    );
    if (presentUnsupported.length > 0) {
      return respondError(
        new UnsupportedFieldError(
          `Unsupported fields: ${presentUnsupported.join(', ')}.`,
          { fields: presentUnsupported }
        ),
        ctx.requestId
      );
    }
  }

  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  const attachmentIds = parsed.data.attachment_ids ?? (parsed.data.attachment_id ? [parsed.data.attachment_id] : []);

  // Validate ownership of email account, attachments, and template.
  const [emailAccount, attachments, template] = await Promise.all([
    getPrisma().emailAccount.findFirst({
      where: { id: parsed.data.email_account_id, user_id: ctx.user.id },
    }),
    Promise.all(attachmentIds.map(id => getPrisma().attachment.findFirst({
      where: { id, user_id: ctx.user.id, deleted_at: null },
    }))),
    getPrisma().template.findFirst({
      where: { id: parsed.data.template_id, user_id: ctx.user.id },
    }),
  ]);

  if (!emailAccount) {
    return respondError(
      new ForbiddenError('Email account not found or does not belong to you.'),
      ctx.requestId
    );
  }
  if (attachments.some(attachment => !attachment)) {
    return respondError(new ForbiddenError('Attachment not found or does not belong to you.'), ctx.requestId);
  }
  if (!template) {
    return respondError(new ForbiddenError('Template not found or does not belong to you.'), ctx.requestId);
  }

  const attachmentError = attachmentSelectionError(attachments.filter(a => a !== null), emailAccount.provider);
  if (attachmentError) return respondError(new ValidationError(attachmentError), ctx.requestId);

  // Validate contact ownership.
  const contactCount = await getPrisma().contact.count({
    where: { id: { in: parsed.data.contact_ids }, user_id: ctx.user.id },
  });
  if (contactCount !== parsed.data.contact_ids.length) {
    return respondError(
      new ForbiddenError('One or more contacts do not belong to you.'),
      ctx.requestId
    );
  }

  // Use the transactional creation service (§6).
  try {
    const result = await createCampaign({
      userId: ctx.user.id,
      name: parsed.data.name,
      templateId: parsed.data.template_id,
      emailAccountId: parsed.data.email_account_id,
      contactIds: parsed.data.contact_ids,
      attachmentIds,
      resendRecipients: parsed.data.resend_recipients.map((r) => ({
        contactId: r.contact_id,
        recipientEmail: r.recipient_email,
      })),
      missingValueAction: parsed.data.missing_value_action,
      unknownTokenAction: parsed.data.unknown_token_action,
      startAt: parsed.data.start_at,
      timezone: parsed.data.timezone,
      intervalMinutes: parsed.data.interval_minutes,
      dailyLimit: parsed.data.daily_limit ?? null,
      idempotencyKey: parsed.data.idempotency_key,
      previewFingerprint: parsed.data.preview_fingerprint,
      requestId: ctx.requestId,
    });

    const campaign = await getPrisma().campaign.findUniqueOrThrow({
      where: { id: result.campaignId },
      select: {
        _count: { select: { email_jobs: true } },
        id: true, name: true, status: true, created_at: true,
        start_at: true, timezone: true, interval_minutes: true, daily_limit: true,
      },
    });

    return respondOk(
      {
        ...campaign,
        recipient_summary: result.recipientSummary,
        replayed: result.status === 'replayed',
      },
      ctx.requestId,
      result.status === 'created' ? 'Campaign created successfully.' : 'Campaign already scheduled.',
      result.status === 'created' ? 201 : 200
    );
  } catch (err) {
    return respondError(err, ctx.requestId);
  }
}, { auth: 'user', rateLimitKey: 'campaign-create' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
