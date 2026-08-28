import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { createCampaignSchema } from '@/lib/validation/campaign';
import { generateCampaignJobs } from '@/lib/jobs/scheduler';
import { checkApiRateLimit } from '@/lib/rate-limit/api';

export async function GET(request: NextRequest) {
  void request;
  const prisma = createPrisma(process.env.DATABASE_URL!);
  const requestId = crypto.randomUUID();
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return withRequestId(NextResponse.json(sessionResult.error, { status: 401 }), requestId);
    }

    const campaigns = await prisma.campaign.findMany({
      where: { user_id: sessionResult.session.user.id },
      select: { id: true, name: true, status: true, created_at: true },
    });

    return withRequestId(NextResponse.json(success(campaigns)), requestId);
  } catch {
    return withRequestId(NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: NextRequest) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  const requestId = crypto.randomUUID();
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return withRequestId(NextResponse.json(sessionResult.error, { status: 401 }), requestId);
    }

    const session = sessionResult.session;
    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'campaign-create');
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return withRequestId(
        NextResponse.json(
          failure('VALIDATION_ERROR', 'Please correct the highlighted fields.', {
            fields: Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message])),
          }),
          { status: 400 }
        ),
        requestId
      );
    }

    const [emailAccount, resume, template] = await Promise.all([
      prisma.emailAccount.findFirst({ where: { id: parsed.data.email_account_id, user_id: session.user.id } }),
      prisma.resume.findFirst({ where: { id: parsed.data.resume_id, user_id: session.user.id, deleted_at: null } }),
      prisma.template.findFirst({ where: { id: parsed.data.template_id, user_id: session.user.id } }),
    ]);

    if (!emailAccount) {
      return withRequestId(NextResponse.json(failure('AUTHORIZATION_ERROR', 'Email account not found or does not belong to you.'), { status: 403 }), requestId);
    }
    if (!resume) {
      return withRequestId(NextResponse.json(failure('AUTHORIZATION_ERROR', 'Resume not found or does not belong to you.'), { status: 403 }), requestId);
    }
    if (!template) {
      return withRequestId(NextResponse.json(failure('AUTHORIZATION_ERROR', 'Template not found or does not belong to you.'), { status: 403 }), requestId);
    }

    const contactCount = await prisma.contact.count({
      where: { id: { in: parsed.data.contact_ids }, user_id: session.user.id },
    });

    if (contactCount !== parsed.data.contact_ids.length) {
      return withRequestId(NextResponse.json(failure('AUTHORIZATION_ERROR', 'One or more contacts do not belong to you.'), { status: 403 }), requestId);
    }

    const campaign = await prisma.campaign.create({
      data: {
        user_id: session.user.id,
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

    await generateCampaignJobs(prisma, {
      id: campaign.id,
      user_id: session.user.id,
      start_at: parsed.data.start_at,
      timezone: parsed.data.timezone,
      interval_minutes: parsed.data.interval_minutes,
      daily_limit: parsed.data.daily_limit,
      email_account_id: parsed.data.email_account_id,
      resume_id: parsed.data.resume_id,
      template_id: parsed.data.template_id,
    }, parsed.data.contact_ids);

    return withRequestId(NextResponse.json(success(campaign, 'Campaign created successfully.'), { status: 201 }), requestId);
  } catch {
    return withRequestId(NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('X-Request-ID', requestId);
  return response;
}
