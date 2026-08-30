import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { updateEmailAccountSecretSchema } from '@/lib/validation/email-account';
import { encryptSecret } from '@/lib/security/encryption';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { NotFoundError, ValidationError, AppError } from '@/lib/errors';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'email-account-update');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsedId = idParamSchema.safeParse({ id });
    if (!parsedId.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const body = await request.json().catch(() => null);
    const parsedBody = updateEmailAccountSecretSchema.safeParse(body);
    if (!parsedBody.success) {
      return respondError(new ValidationError('App password is required.'), requestId);
    }

    const account = await getPrisma().emailAccount.findFirst({
      where: { id: parsedId.data.id, user_id: user.id },
    });

    if (!account) {
      return respondError(new NotFoundError('Email account not found.'), requestId);
    }

    if (!account.is_active) {
      return respondError(
        new AppError(
          'Cannot update the app password of a deactivated account. Reactivate it first.',
          400,
          'BUSINESS_ERROR'
        ),
        requestId
      );
    }

    const encryptedSecret = await encryptSecret(parsedBody.data.secret, process.env.SMTP_ENCRYPTION_KEY!);

    await getPrisma().emailAccount.update({
      where: { id: parsedId.data.id, user_id: user.id },
      data: { encrypted_secret: encryptedSecret },
    });

    return respondOk(null, requestId, 'App password updated.');
  } catch (err) {
    return respondError(err, requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  void request;
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'email-account-delete');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const emailAccount = await getPrisma().emailAccount.findFirst({
      where: { id: parsed.data.id, user_id: user.id },
    });

    if (!emailAccount) {
      return respondError(new NotFoundError('Email account not found.'), requestId);
    }

    const pendingJobCount = await getPrisma().emailJob.count({
      where: {
        email_account_id: parsed.data.id,
        status: { in: ['SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT'] },
      },
    });

    if (pendingJobCount > 0) {
      await getPrisma().emailAccount.update({
        where: { id: emailAccount.id },
        data: { is_active: false },
      });
      return respondOk(null, requestId, 'Email account deactivated and retained for pending email jobs.');
    }

    await getPrisma().emailAccount.update({
      where: { id: parsed.data.id, user_id: user.id },
      data: { is_active: false },
    });

    return respondOk(null, requestId, 'Email account deactivated.');
  } catch (err) {
    return respondError(err, requestId);
  }
}
