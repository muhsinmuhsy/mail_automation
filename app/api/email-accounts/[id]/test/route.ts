import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { decryptSecret } from '@/lib/security/encryption';
import { NotFoundError, ExternalServiceError, ValidationError } from '@/lib/errors';

const _POST = defineRoute(async (req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const account = await getPrisma().emailAccount.findUnique({
    where: { id: parsed.data.id },
  });

  if (!account) {
    return respondError(new NotFoundError('Email account not found.'), ctx.requestId);
  }

  if (!account.encrypted_secret) {
    return respondError(new ValidationError('No credentials stored for this account.'), ctx.requestId);
  }

  const decryptedSecret = await decryptSecret(account.encrypted_secret, process.env.SMTP_ENCRYPTION_KEY!);

  const { GmailProvider } = await import('@/lib/email/providers/gmail');
  const provider = new GmailProvider();
  try {
    const result = await provider.testConnection({ email: account.email, secret: decryptedSecret });
    return respondOk({ connected: result.success, message: result.message }, ctx.requestId);
  } catch (err) {
    if (err instanceof ExternalServiceError || err instanceof NotFoundError || err instanceof ValidationError) {
      return respondError(err, ctx.requestId);
    }
    return respondError(
      new ExternalServiceError("We couldn't connect to your email account. Please check your credentials."),
      ctx.requestId
    );
  }
}, {
  auth: {
    ownership: async (params) => {
      const acc = await getPrisma().emailAccount.findUnique({
        where: { id: params.id },
        select: { user_id: true },
      });
      if (!acc) throw new NotFoundError('Email account not found.');
      return acc.user_id;
    },
  },
  rateLimitKey: 'smtp-test',
});


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
