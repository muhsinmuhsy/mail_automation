import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { idParamSchema } from '@/lib/validation/common';

export async function GET(
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

    const emailJob = await prisma.emailJob.findFirst({
      where: { id: parsed.data.id, user_id: sessionResult.session.user.id },
      include: { email_logs: true },
    });

    if (!emailJob) {
      return NextResponse.json(failure('NOT_FOUND', 'Email not found.'), { status: 404 });
    }

    return NextResponse.json(success(emailJob));
  } catch (error) {
    return NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
