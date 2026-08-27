import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { idParamSchema } from '@/lib/validation/common';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;
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

    await prisma.campaign.updateMany({
      where: { id: parsed.data.id, user_id: sessionResult.session.user.id },
      data: { status: 'PAUSED' },
    });

    return NextResponse.json(success(null, 'Campaign paused.'));
  } catch {
    return NextResponse.json(failure('NOT_FOUND', 'Campaign not found.'), { status: 404 });
  } finally {
    await prisma.$disconnect();
  }
}
