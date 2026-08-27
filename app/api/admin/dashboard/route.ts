import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';

export async function GET(request: NextRequest) {
  void request;
  const prisma = createPrisma(process.env.DATABASE_URL!);
  const requestId = crypto.randomUUID();
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return withRequestId(NextResponse.json(failure('AUTHORIZATION_ERROR', 'Admin access required.'), { status: 403 }), requestId);
    }

    const users = await prisma.user.count();
    const settings = await prisma.systemSetting.findUnique({ where: { id: 1 } });

    return withRequestId(NextResponse.json(success({
      totalUsers: users,
      settings,
    })), requestId);
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
