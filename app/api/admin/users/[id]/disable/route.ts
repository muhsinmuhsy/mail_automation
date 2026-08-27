import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/neon-auth';
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
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return withRequestId(NextResponse.json(failure('AUTHORIZATION_ERROR', 'Admin access required.'), { status: 403 }), requestId);
    }

    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'admin-user-disable');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 }), requestId);
    }

    const targetUser = await prisma.user.findUnique({ where: { id: parsed.data.id } });
    if (!targetUser) {
      return withRequestId(NextResponse.json(failure('NOT_FOUND', 'User not found.'), { status: 404 }), requestId);
    }

    if (targetUser.role === 'ADMIN' && targetUser.id === session.user.id) {
      return withRequestId(NextResponse.json(failure('BUSINESS_ERROR', 'Cannot disable the last active admin.'), { status: 400 }), requestId);
    }

    await prisma.user.update({
      where: { id: parsed.data.id },
      data: { is_active: false },
    });

    return withRequestId(NextResponse.json(success(null, 'User disabled.')), requestId);
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
