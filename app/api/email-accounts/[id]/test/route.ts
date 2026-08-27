import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { idParamSchema } from '@/lib/validation/common';
import { decryptSecret } from '@/lib/security/encryption';

export async function POST(
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

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return withRequestId(NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 }), requestId);
    }

    const account = await prisma.emailAccount.findUnique({
      where: { id: parsed.data.id },
    });

    if (!account || account.user_id !== sessionResult.session.user.id) {
      return withRequestId(NextResponse.json(failure('NOT_FOUND', 'Email account not found.'), { status: 404 }), requestId);
    }

    if (!account.encrypted_secret) {
      return withRequestId(NextResponse.json(failure('BUSINESS_ERROR', 'No credentials stored for this account.'), { status: 400 }), requestId);
    }

    const decryptedSecret = await decryptSecret(account.encrypted_secret, process.env.SMTP_ENCRYPTION_KEY!);

    const { GmailProvider } = await import('@/lib/email/providers/gmail');
    const provider = new GmailProvider();
    const result = await provider.testConnection({ email: account.email, secret: decryptedSecret });

    return withRequestId(NextResponse.json(success({ connected: result.success, message: result.message })), requestId);
  } catch {
    return withRequestId(NextResponse.json(failure('PROVIDER_ERROR', 'We couldn\'t connect to your email account. Please check your credentials.'), { status: 502 }), requestId);
  } finally {
    await prisma.$disconnect();
  }
}

function withRequestId(response: NextResponse, requestId: string): NextResponse {
  response.headers.set('X-Request-ID', requestId);
  return response;
}
