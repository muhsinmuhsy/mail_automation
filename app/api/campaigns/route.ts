import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { createCampaignSchema } from '@/lib/validation/campaign';

export async function GET(request: NextRequest) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return NextResponse.json(sessionResult.error, { status: 401 });
    }

    const campaigns = await prisma.campaign.findMany({
      where: { user_id: sessionResult.session.user.id },
      select: { id: true, name: true, status: true, created_at: true },
    });

    return NextResponse.json(success(campaigns));
  } catch (error) {
    return NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: NextRequest) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return NextResponse.json(sessionResult.error, { status: 401 });
    }

    const body = await request.json();
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        failure('VALIDATION_ERROR', 'Please correct the highlighted fields.', {
          fields: Object.fromEntries(parsed.error.errors.map(e => [e.path.join('.'), e.message])),
        }),
        { status: 400 }
      );
    }

    const campaign = await prisma.campaign.create({
      data: {
        user_id: sessionResult.session.user.id,
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

    return NextResponse.json(success(campaign, 'Campaign created successfully.'), { status: 201 });
  } catch (error) {
    return NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

