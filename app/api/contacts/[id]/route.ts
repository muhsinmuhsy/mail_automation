import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { idParamSchema } from '@/lib/validation/common';
import { updateContactSchema } from '@/lib/validation/contact';
import { checkApiRateLimit } from '@/lib/rate-limit/api';

export async function PATCH(
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
    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'contact-update');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 }), requestId);
    }

    const body = await request.json();
    const updateParsed = updateContactSchema.safeParse(body);
    if (!updateParsed.success) {
      return withRequestId(
        NextResponse.json(
          failure('VALIDATION_ERROR', 'Please correct the highlighted fields.', {
            fields: Object.fromEntries(updateParsed.error.errors.map(e => [e.path.join('.'), e.message])),
          }),
          { status: 400 }
        ),
        requestId
      );
    }

    const contact = await prisma.contact.updateMany({
      where: { id: parsed.data.id, user_id: session.user.id },
      data: updateParsed.data,
    });

    if (contact.count === 0) {
      return withRequestId(NextResponse.json(failure('NOT_FOUND', 'Contact not found.'), { status: 404 }), requestId);
    }

    return withRequestId(NextResponse.json(success(null, 'Contact updated.')), requestId);
  } catch {
    return withRequestId(NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

export async function DELETE(
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
    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'contact-delete');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 }), requestId);
    }

    await prisma.contact.deleteMany({
      where: { id: parsed.data.id, user_id: session.user.id },
    });

    return withRequestId(NextResponse.json(success(null, 'Contact deleted.')), requestId);
  } catch {
    return withRequestId(NextResponse.json(failure('NOT_FOUND', 'Contact not found.'), { status: 404 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('X-Request-ID', requestId);
  return response;
}
