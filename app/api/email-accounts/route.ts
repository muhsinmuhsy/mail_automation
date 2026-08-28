import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { createEmailAccountSchema } from '@/lib/validation/email-account';
import { encryptSecret } from '@/lib/security/encryption';
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

    const accounts = await prisma.emailAccount.findMany({
      where: { user_id: sessionResult.session.user.id },
      select: { id: true, provider: true, email: true, is_active: true, created_at: true },
    });

    return withRequestId(NextResponse.json(success(accounts)), requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'We couldn\'t complete your request. Please try again.';
    return withRequestId(NextResponse.json(failure('INTERNAL_ERROR', message), { status: 500 }), requestId);
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
    const rateLimitResult = await checkApiRateLimit(request, session.user.id, 'email-account-create');
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const parsed = createEmailAccountSchema.safeParse(body);
    if (!parsed.success) {
      return withRequestId(
        NextResponse.json(
          failure('VALIDATION_ERROR', 'Please correct the highlighted fields.', {
            fields: Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message])),
          }),
          { status: 400 }
        ),
        requestId
      );
    }

    const encryptedSecret = await encryptSecret(parsed.data.secret, process.env.SMTP_ENCRYPTION_KEY!);

    const account = await prisma.emailAccount.create({
      data: {
        user_id: session.user.id,
        provider: parsed.data.provider,
        email: parsed.data.email,
        auth_method: parsed.data.auth_method,
        encrypted_secret: encryptedSecret,
      },
      select: { id: true, provider: true, email: true, is_active: true, created_at: true },
    });

    return withRequestId(NextResponse.json(success(account, 'Email account connected successfully.'), { status: 201 }), requestId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'We couldn\'t complete your request. Please try again.';
    
    if ((error as { code?: string })?.code === 'P2002') {
      return withRequestId(NextResponse.json(failure('BUSINESS_ERROR', 'This email account is already connected.'), { status: 409 }), requestId);
    }
    
    return withRequestId(NextResponse.json(failure('INTERNAL_ERROR', errorMessage), { status: 500 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('X-Request-ID', requestId);
  return response;
}
