import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { idParamSchema } from '@/lib/validation/common';

export async function DELETE(
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

    await prisma.resume.update({
      where: { id: parsed.data.id, user_id: sessionResult.session.user.id },
      data: { deleted_at: new Date() },
    });

    return NextResponse.json(success(null, 'Resume deleted.'));
  } catch (error) {
    return NextResponse.json(failure('NOT_FOUND', 'Resume not found.'), { status: 404 });
  } finally {
    await prisma.$disconnect();
  }
}
