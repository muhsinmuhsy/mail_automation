import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { idParamSchema } from '@/lib/validation/common';
import { checkApiRateLimit } from '@/lib/rate-limit/api';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;
  const prisma = createPrisma(process.env.DATABASE_URL!);
  const requestId = crypto.randomUUID();
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return withRequestId(NextResponse.json(sessionResult.error, { status: 401 }), requestId);
    }

    const session = sessionResult.session;
    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'resume-default');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 }), requestId);
    }

    const resume = await prisma.resume.findFirst({
      where: { id: parsed.data.id, user_id: session.user.id, deleted_at: null },
    });
    if (!resume) {
      return withRequestId(NextResponse.json(failure('NOT_FOUND', 'Resume not found.'), { status: 404 }), requestId);
    }

    await prisma.$transaction([
      prisma.resume.updateMany({ where: { user_id: session.user.id, deleted_at: null }, data: { is_default: false } }),
      prisma.resume.update({ where: { id: resume.id }, data: { is_default: true } }),
    ]);

    return withRequestId(NextResponse.json(success(null, 'Default resume set.')), requestId);
  } catch {
    return withRequestId(NextResponse.json(failure('NOT_FOUND', 'Resume not found.'), { status: 404 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('X-Request-ID', requestId);
  return response;
}
