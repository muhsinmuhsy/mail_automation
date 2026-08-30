import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { idParamSchema } from '@/lib/validation/common';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { createStorageService } from '@/lib/storage/storage.factory';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  const requestId = crypto.randomUUID();
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return withRequestId(NextResponse.json(sessionResult.error, { status: 401 }), requestId);
    }

    const session = sessionResult.session;
    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'resume-delete');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 }), requestId);
    }

    const resume = await prisma.resume.findFirst({
      where: { id: parsed.data.id, user_id: session.user.id },
    });

    if (!resume) {
      return withRequestId(NextResponse.json(failure('NOT_FOUND', 'Resume not found.'), { status: 404 }), requestId);
    }

    const pendingJobCount = await prisma.emailJob.count({
      where: {
        resume_id: parsed.data.id,
        status: { in: ['SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT'] },
      },
    });

    if (pendingJobCount > 0) {
      await prisma.resume.update({ where: { id: resume.id }, data: { deleted_at: new Date(), is_default: false } });
      return withRequestId(NextResponse.json(success(null, 'Resume removed and retained for pending emails.')), requestId);
    }

    await createStorageService(process.env).delete(resume.storage_key);
    await prisma.resume.delete({ where: { id: resume.id } });

    return withRequestId(NextResponse.json(success(null, 'Resume deleted.')), requestId);
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
