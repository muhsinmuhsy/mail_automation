import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { createEmailAccountSchema } from '@/lib/validation/email-account';

export async function GET(request: NextRequest) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return NextResponse.json(sessionResult.error, { status: 401 });
    }

    const accounts = await prisma.emailAccount.findMany({
      where: { user_id: sessionResult.session.user.id },
      select: { id: true, provider: true, email: true, is_active: true, created_at: true },
    });

    return NextResponse.json(success(accounts));
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
    const parsed = createEmailAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        failure('VALIDATION_ERROR', 'Please correct the highlighted fields.', {
          fields: Object.fromEntries(parsed.error.errors.map(e => [e.path.join('.'), e.message])),
        }),
        { status: 400 }
      );
    }

    const account = await prisma.emailAccount.create({
      data: {
        user_id: sessionResult.session.user.id,
        provider: parsed.data.provider,
        email: parsed.data.email,
        auth_method: parsed.data.auth_method,
        encrypted_secret: parsed.data.secret,
      },
      select: { id: true, provider: true, email: true, is_active: true, created_at: true },
    });

    return NextResponse.json(success(account, 'Email account connected successfully.'), { status: 201 });
  } catch (error) {
    return NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

