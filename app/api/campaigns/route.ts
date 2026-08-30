import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { createCampaignSchema } from '@/lib/validation/campaign';
import { generateCampaignJobs } from '@/lib/jobs/scheduler';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { ValidationError, ForbiddenError } from '@/lib/errors';

const CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();
    const { page, limit, search } = parseListQuery(request, { search: true });

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');
    const statusFilter =
      statusParam && (CAMPAIGN_STATUSES as readonly string[]).includes(statusParam)
        ? { status: statusParam as (typeof CAMPAIGN_STATUSES)[number] }
        : {};

    const where = {
      user_id: user.id,
      ...statusFilter,
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [campaigns, total] = await Promise.all([
      getPrisma().campaign.findMany({
        where,
        select: { id: true, name: true, status: true, created_at: true },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      getPrisma().campaign.count({ where }),
    ]);

    return respondList(campaigns, total, page, limit, requestId);
  } catch (err) {
    return respondError(err, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'campaign-create');
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(
        new ValidationError(
          'Please correct the highlighted fields.',
          Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message]))
        ),
        requestId
      );
    }

    const [emailAccount, resume, template] = await Promise.all([
      getPrisma().emailAccount.findFirst({
        where: { id: parsed.data.email_account_id, user_id: user.id },
      }),
      getPrisma().resume.findFirst({
        where: { id: parsed.data.resume_id, user_id: user.id, deleted_at: null },
      }),
      getPrisma().template.findFirst({
        where: { id: parsed.data.template_id, user_id: user.id },
      }),
    ]);

    if (!emailAccount) {
      return respondError(
        new ForbiddenError('Email account not found or does not belong to you.'),
        requestId
      );
    }
    if (!resume) {
      return respondError(new ForbiddenError('Resume not found or does not belong to you.'), requestId);
    }
    if (!template) {
      return respondError(new ForbiddenError('Template not found or does not belong to you.'), requestId);
    }

    const contactCount = await getPrisma().contact.count({
      where: { id: { in: parsed.data.contact_ids }, user_id: user.id },
    });

    if (contactCount !== parsed.data.contact_ids.length) {
      return respondError(
        new ForbiddenError('One or more contacts do not belong to you.'),
        requestId
      );
    }

    const campaign = await getPrisma().campaign.create({
      data: {
        user_id: user.id,
        name: parsed.data.name,
        email_account_id: parsed.data.email_account_id,
        resume_id: parsed.data.resume_id,
        template_id: parsed.data.template_id,
        start_at: parsed.data.start_at,
        timezone: parsed.data.timezone,
        interval_minutes: parsed.data.interval_minutes,
        daily_limit: parsed.data.daily_limit ?? undefined,
      },
      select: { id: true, name: true, status: true, created_at: true },
    });

    await generateCampaignJobs(
      getPrisma(),
      {
        id: campaign.id,
        user_id: user.id,
        start_at: parsed.data.start_at,
        timezone: parsed.data.timezone,
        interval_minutes: parsed.data.interval_minutes,
        daily_limit: parsed.data.daily_limit,
        email_account_id: parsed.data.email_account_id,
        resume_id: parsed.data.resume_id,
        template_id: parsed.data.template_id,
      },
      parsed.data.contact_ids
    );

    return respondOk(campaign, requestId, 'Campaign created successfully.', 201);
  } catch (err) {
    return respondError(err, requestId);
  }
}
