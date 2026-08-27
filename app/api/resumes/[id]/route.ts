import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { idParamSchema } from '@/lib/validation/common';
import { checkApiRateLimit } from '@/lib/rate-limit/api';

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
      return withRequestId(
        NextResponse.json(
          failure('BUSINESS_ERROR', 'Cannot delete resume while it has pending email jobs. Please cancel the associated campaign first.'),
          { status: 400 }
        ),
        requestId
      );
    }

    await prisma.resume.update({
      where: { id: parsed.data.id, user_id: session.user.id },
      data: { deleted_at: new Date() },
    });

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
