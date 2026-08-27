import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { idParamSchema } from '@/lib/validation/common';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return NextResponse.json(sessionResult.error, { status: 401 });
    }

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 });
    }

    const account = await prisma.emailAccount.findUnique({
      where: { id: parsed.data.id },
    });

    if (!account || account.user_id !== sessionResult.session.user.id) {
      return NextResponse.json(failure('NOT_FOUND', 'Email account not found.'), { status: 404 });
    }

    const { GmailProvider } = await import('@/lib/email/providers/gmail');
    const provider = new GmailProvider();
    const result = await provider.testConnection({
      email: account.email,
      secret: 'test_secret_placeholder',
    });

    return NextResponse.json(success({ connected: result.success, message: result.message }));
  } catch (error) {
    return NextResponse.json(failure('PROVIDER_ERROR', 'We couldn\'t connect to your email account. Please check your credentials.'), { status: 502 });
  } finally {
    await prisma.$disconnect();
  }
}
