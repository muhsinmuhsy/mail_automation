import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { idParamSchema } from '@/lib/validation/common';
import { adminUpdateUserSchema } from '@/lib/validation/admin';
import { checkApiRateLimit } from '@/lib/rate-limit/api';

export async function GET(
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

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 }), requestId);
    }

    const user = await prisma.user.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, email: true, name: true, role: true, is_active: true, daily_email_limit_override: true, created_at: true },
    });

    if (!user) {
      return withRequestId(NextResponse.json(failure('NOT_FOUND', 'User not found.'), { status: 404 }), requestId);
    }

    return withRequestId(NextResponse.json(success(user)), requestId);
  } catch {
    return withRequestId(NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  const requestId = crypto.randomUUID();
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return withRequestId(NextResponse.json(failure('AUTHORIZATION_ERROR', 'Admin access required.'), { status: 403 }), requestId);
    }

    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'admin-user-update');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 }), requestId);
    }

    const body = await request.json();
    const updateParsed = adminUpdateUserSchema.safeParse(body);
    if (!updateParsed.success) {
      return withRequestId(
        NextResponse.json(
          failure('VALIDATION_ERROR', 'Please correct the highlighted fields.', {
            fields: Object.fromEntries(updateParsed.error.errors.map((e) => [e.path.join('.'), e.message])),
          }),
          { status: 400 }
        ),
        requestId
      );
    }

    const targetUser = await prisma.user.findUnique({ where: { id: parsed.data.id } });
    if (!targetUser) {
      return withRequestId(NextResponse.json(failure('NOT_FOUND', 'User not found.'), { status: 404 }), requestId);
    }

    if (targetUser.role === 'ADMIN' && targetUser.id === session.user.id && updateParsed.data.is_active === false) {
      return withRequestId(NextResponse.json(failure('BUSINESS_ERROR', 'Cannot disable the last active admin.'), { status: 400 }), requestId);
    }

    const updated = await prisma.user.update({
      where: { id: parsed.data.id },
      data: {
        is_active: updateParsed.data.is_active ?? targetUser.is_active,
        daily_email_limit_override: updateParsed.data.daily_email_limit_override ?? targetUser.daily_email_limit_override,
      },
      select: { id: true, email: true, name: true, role: true, is_active: true, daily_email_limit_override: true },
    });

    return withRequestId(NextResponse.json(success(updated, 'User updated.')), requestId);
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
