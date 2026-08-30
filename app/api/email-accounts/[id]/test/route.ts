import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { decryptSecret } from '@/lib/security/encryption';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { NotFoundError, ExternalServiceError, ValidationError } from '@/lib/errors';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'smtp-test');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const account = await getPrisma().emailAccount.findUnique({
      where: { id: parsed.data.id },
    });

    if (!account || account.user_id !== user.id) {
      return respondError(new NotFoundError('Email account not found.'), requestId);
    }

    if (!account.encrypted_secret) {
      return respondError(
        new ValidationError('No credentials stored for this account.'),
        requestId
      );
    }

    const decryptedSecret = await decryptSecret(account.encrypted_secret, process.env.SMTP_ENCRYPTION_KEY!);

    const { GmailProvider } = await import('@/lib/email/providers/gmail');
    const provider = new GmailProvider();
    const result = await provider.testConnection({ email: account.email, secret: decryptedSecret });

    return respondOk({ connected: result.success, message: result.message }, requestId);
  } catch (err) {
    if (err instanceof ExternalServiceError || err instanceof NotFoundError || err instanceof ValidationError) {
      return respondError(err, requestId);
    }
    return respondError(
      new ExternalServiceError("We couldn't connect to your email account. Please check your credentials."),
      requestId
    );
  }
}
