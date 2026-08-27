import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';

export async function GET(request: NextRequest) {
  void request;
  const prisma = createPrisma(process.env.DATABASE_URL!);
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(failure('AUTHORIZATION_ERROR', 'Admin access required.'), { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, is_active: true, daily_email_limit_override: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json(success(users));
  } catch {
    return NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  const requestId = crypto.randomUUID();
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return withRequestId(NextResponse.json(failure('AUTHORIZATION_ERROR', 'Admin access required.'), { status: 403 }), requestId);
    }

    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const { is_active, daily_email_limit_override } = body;

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return withRequestId(NextResponse.json(failure('NOT_FOUND', 'User not found.'), { status: 404 }), requestId);
    }

    if (targetUser.role === 'ADMIN' && targetUser.id === session.user.id && is_active === false) {
      return withRequestId(NextResponse.json(failure('BUSINESS_ERROR', 'Cannot disable the last active admin.'), { status: 400 }), requestId);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        is_active: (is_active as boolean) ?? targetUser.is_active,
        daily_email_limit_override: (daily_email_limit_override as number | null) ?? targetUser.daily_email_limit_override,
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
