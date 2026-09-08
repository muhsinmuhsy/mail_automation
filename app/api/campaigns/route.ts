import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { createCampaignSchema } from '@/lib/validation/campaign';
import { generateCampaignJobs } from '@/lib/jobs/scheduler';
import { ValidationError, ForbiddenError, AppError } from '@/lib/errors';
import { runMissingValueCheck, contactsMissingValues } from '@/lib/campaigns/missing-values';

import { attachmentSelectionError } from '@/lib/email/attachment-limits';

const CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;

const _GET = defineRoute(async (req, ctx) => {
  const { page, limit, search } = parseListQuery(req, { search: true });

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const statusFilter =
    statusParam && (CAMPAIGN_STATUSES as readonly string[]).includes(statusParam)
      ? { status: statusParam as (typeof CAMPAIGN_STATUSES)[number] }
      : {};

  const where = {
    user_id: ctx.user.id,
    ...statusFilter,
    ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [campaigns, total] = await Promise.all([
    getPrisma().campaign.findMany({
      where,
      select: { _count: { select: { email_jobs: true } }, id: true, name: true, status: true, created_at: true, start_at: true, timezone: true, interval_minutes: true, daily_limit: true },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    getPrisma().campaign.count({ where }),
  ]);

  return respondList(campaigns, total, page, limit, ctx.requestId);
}, { auth: 'user' });

const _POST = defineRoute(async (req, ctx) => {
  const body = await req.json();
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

  const contactCount = await getPrisma().contact.count({
    where: { id: { in: parsed.data.contact_ids }, user_id: ctx.user.id },
  });

  if (contactCount !== parsed.data.contact_ids.length) {
    return respondError(
      new ForbiddenError('One or more contacts do not belong to you.'),
      ctx.requestId
    );
  }

  const missingValueResult = await runMissingValueCheck(
    getPrisma(),
    ctx.user.id,
    template.subject,
    template.body,
    parsed.data.contact_ids
  );

  const hasMissingValues = missingValueResult.missingValues.length > 0;
  const action = parsed.data.missing_value_action;

  if (hasMissingValues && action === 'exclude') {
    const missingIds = contactsMissingValues(missingValueResult);
    const remaining = parsed.data.contact_ids.filter((id) => !missingIds.has(id));
    if (remaining.length === 0) {
      return respondError(
        new AppError(
          'No recipients remaining after excluding contacts with missing values. Cannot create an empty campaign.',
          400,
          'VALIDATION_ERROR'
        ),
        ctx.requestId
      );
    }
    const unfiltered = parsed.data.contact_ids.filter((id) => missingIds.has(id));
    if (unfiltered.length > 0) {
      return respondError(
        new ValidationError(
          `Exclude action submitted, but ${unfiltered.length} contact(s) still have missing values. Please filter them out.`,
          missingValueResult
        ),
        ctx.requestId
      );
    }
  } else if (hasMissingValues && action === undefined) {
    return respondError(
      new ValidationError(
        'Some contacts are missing values for fields used in the template. Choose to exclude affected contacts or continue anyway.',
        missingValueResult
      ),
      ctx.requestId
    );
  }

  const campaign = await getPrisma().campaign.create({
    data: {
      user_id: ctx.user.id,
      name: parsed.data.name,
      email_account_id: parsed.data.email_account_id,
      attachment_id: parsed.data.attachment_id ?? null,
      attachment_ids: attachmentIds,
      template_id: parsed.data.template_id,
      start_at: parsed.data.start_at,
      timezone: parsed.data.timezone,
      interval_minutes: parsed.data.interval_minutes,
      daily_limit: parsed.data.daily_limit ?? undefined,
      status: 'ACTIVE',
    },
    select: { _count: { select: { email_jobs: true } }, id: true, name: true, status: true, created_at: true, start_at: true, timezone: true, interval_minutes: true, daily_limit: true },
  });

  await generateCampaignJobs(
    getPrisma(),
    {
      id: campaign.id,
      user_id: ctx.user.id,
      start_at: parsed.data.start_at,
      timezone: parsed.data.timezone,
      interval_minutes: parsed.data.interval_minutes,
      daily_limit: parsed.data.daily_limit,
      email_account_id: parsed.data.email_account_id,
      attachment_id: parsed.data.attachment_id ?? null,
      attachment_ids: attachmentIds,
      template_id: parsed.data.template_id,
    },
    parsed.data.contact_ids
  );

  return respondOk(campaign, ctx.requestId, 'Campaign created successfully.', 201);
}, { auth: 'user', rateLimitKey: 'campaign-create' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
