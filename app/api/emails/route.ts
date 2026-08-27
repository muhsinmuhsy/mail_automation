import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';

export async function GET(request: NextRequest) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return NextResponse.json(sessionResult.error, { status: 401 });
    }

    const emails = await prisma.emailJob.findMany({
      where: { user_id: sessionResult.session.user.id },
      select: { id: true, to_email: true, subject: true, status: true, sent_at: true },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return NextResponse.json(success(emails));
  } catch (error) {
    return NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

