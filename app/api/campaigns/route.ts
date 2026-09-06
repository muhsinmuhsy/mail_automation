import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { createCampaignSchema } from '@/lib/validation/campaign';
import { generateCampaignJobs } from '@/lib/jobs/scheduler';
import { ValidationError, ForbiddenError } from '@/lib/errors';

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
      select: { id: true, name: true, status: true, created_at: true, start_at: true, timezone: true, interval_minutes: true, daily_limit: true },
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

  const [emailAccount, attachment, template] = await Promise.all([
    getPrisma().emailAccount.findFirst({
      where: { id: parsed.data.email_account_id, user_id: ctx.user.id },
    }),
    getPrisma().attachment.findFirst({
      where: { id: parsed.data.attachment_id, user_id: ctx.user.id, deleted_at: null },
    }),
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
  if (!attachment) {
    return respondError(new ForbiddenError('Attachment not found or does not belong to you.'), ctx.requestId);
  }
  if (!template) {
    return respondError(new ForbiddenError('Template not found or does not belong to you.'), ctx.requestId);
  }

  const contactCount = await getPrisma().contact.count({
    where: { id: { in: parsed.data.contact_ids }, user_id: ctx.user.id },
  });

  if (contactCount !== parsed.data.contact_ids.length) {
    return respondError(
      new ForbiddenError('One or more contacts do not belong to you.'),
      ctx.requestId
    );
  }

  const campaign = await getPrisma().campaign.create({
    data: {
      user_id: ctx.user.id,
      name: parsed.data.name,
      email_account_id: parsed.data.email_account_id,
      attachment_id: parsed.data.attachment_id,
      template_id: parsed.data.template_id,
      start_at: parsed.data.start_at,
      timezone: parsed.data.timezone,
      interval_minutes: parsed.data.interval_minutes,
      daily_limit: parsed.data.daily_limit ?? undefined,
      status: 'ACTIVE',
    },
    select: { id: true, name: true, status: true, created_at: true, start_at: true, timezone: true, interval_minutes: true, daily_limit: true },
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
      attachment_id: parsed.data.attachment_id,
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
