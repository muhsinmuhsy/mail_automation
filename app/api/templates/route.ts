import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { createTemplateSchema } from '@/lib/validation/template';
import { checkApiRateLimit } from '@/lib/rate-limit/api';

export async function GET(request: NextRequest) {
  void request;
  const prisma = createPrisma(process.env.DATABASE_URL!);
  const requestId = crypto.randomUUID();
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return withRequestId(NextResponse.json(sessionResult.error, { status: 401 }), requestId);
    }

    const templates = await prisma.template.findMany({
      where: { user_id: sessionResult.session.user.id },
      select: { id: true, name: true, subject: true, created_at: true },
    });

    return withRequestId(NextResponse.json(success(templates)), requestId);
  } catch {
    return withRequestId(NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: NextRequest) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  const requestId = crypto.randomUUID();
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return withRequestId(NextResponse.json(sessionResult.error, { status: 401 }), requestId);
    }

    const session = sessionResult.session;
    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'template-create');
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return withRequestId(
        NextResponse.json(
          failure('VALIDATION_ERROR', 'Please correct the highlighted fields.', {
            fields: Object.fromEntries(parsed.error.errors.map(e => [e.path.join('.'), e.message])),
          }),
          { status: 400 }
        ),
        requestId
      );
    }

    const template = await prisma.template.create({
      data: {
        user_id: session.user.id,
        name: parsed.data.name,
        subject: parsed.data.subject,
        body: parsed.data.body,
      },
      select: { id: true, name: true, subject: true, created_at: true },
    });

    return withRequestId(NextResponse.json(success(template, 'Template created successfully.'), { status: 201 }), requestId);
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
