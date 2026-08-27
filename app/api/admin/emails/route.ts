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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (status === 'sent') where.status = 'SENT';
    if (status === 'failed') where.status = 'FAILED';
    if (status === 'retry') where.status = 'RETRY_WAIT';

    const [jobs, total] = await Promise.all([
      prisma.emailJob.findMany({
        where,
        select: { id: true, to_email: true, subject: true, status: true, sent_at: true, error_message: true, created_at: true, user: { select: { email: true } } },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
      prisma.emailJob.count({ where }),
    ]);

    return withRequestId(NextResponse.json(success({ jobs, total, page: 1, limit: 50 })), requestId);
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
