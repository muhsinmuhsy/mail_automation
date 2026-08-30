import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { idParamSchema } from '@/lib/validation/common';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { encryptSecret } from '@/lib/security/encryption';
import { updateEmailAccountSecretSchema } from '@/lib/validation/email-account';

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
    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'email-account-update');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsedId = idParamSchema.safeParse({ id });
    if (!parsedId.success) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 }), requestId);
    }

    const body = await request.json().catch(() => null);
    const parsedBody = updateEmailAccountSecretSchema.safeParse(body);
    if (!parsedBody.success) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'App password is required.'), { status: 400 }), requestId);
    }

    const account = await prisma.emailAccount.findFirst({
      where: { id: parsedId.data.id, user_id: session.user.id },
    });

    if (!account) {
      return withRequestId(NextResponse.json(failure('NOT_FOUND', 'Email account not found.'), { status: 404 }), requestId);
    }

    const encryptedSecret = await encryptSecret(parsedBody.data.secret, process.env.SMTP_ENCRYPTION_KEY!);

    await prisma.emailAccount.update({
      where: { id: parsedId.data.id, user_id: session.user.id },
      data: { encrypted_secret: encryptedSecret },
    });

    return withRequestId(NextResponse.json(success(null, 'App password updated.')), requestId);
  } catch {
    return withRequestId(NextResponse.json(failure('INTERNAL_ERROR', 'Failed to update email account.'), { status: 500 }), requestId);
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
    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'email-account-delete');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 }), requestId);
    }

    const emailAccount = await prisma.emailAccount.findFirst({
      where: { id: parsed.data.id, user_id: session.user.id },
    });

    if (!emailAccount) {
      return withRequestId(NextResponse.json(failure('NOT_FOUND', 'Email account not found.'), { status: 404 }), requestId);
    }

    const pendingJobCount = await prisma.emailJob.count({
      where: {
        email_account_id: parsed.data.id,
        status: { in: ['SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT'] },
      },
    });

    if (pendingJobCount > 0) {
      return withRequestId(
        NextResponse.json(
          failure('BUSINESS_ERROR', 'Cannot deactivate email account while it has pending email jobs. Please cancel the associated campaign first.'),
          { status: 400 }
        ),
        requestId
      );
    }

    await prisma.emailAccount.update({
      where: { id: parsed.data.id, user_id: session.user.id },
      data: { is_active: false },
    });

    return withRequestId(NextResponse.json(success(null, 'Email account deactivated.')), requestId);
  } catch {
    return withRequestId(NextResponse.json(failure('NOT_FOUND', 'Email account not found.'), { status: 404 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('X-Request-ID', requestId);
  return response;
}
