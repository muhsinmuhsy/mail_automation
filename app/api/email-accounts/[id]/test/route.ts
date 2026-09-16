import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
// import { decryptSecret } from '@/lib/security/encryption';
import { NotFoundError, ExternalServiceError, ValidationError } from '@/lib/errors';
import { gmailAccessToken } from '@/lib/email/accounts/credential-service';
import { sendEmail } from '@/lib/email/service';
import { ReconnectRequiredError } from '@/lib/email/providers/gmail/oauth';

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
  if (account.auth_method === 'oauth2') {
    if (account.user_id !== ctx.user.id) throw new ValidationError('Only the account owner can verify authorization.');
    try {
      const token = await gmailAccessToken(getPrisma(), account, process.env, true);
      const result = await sendEmail({
        provider: 'gmail',
        from: account.email,
        to: account.email,
        subject: 'Test email from Mail Automation',
        body: 'This is a test email to verify that your Gmail account can send emails. If you received this, your email setup is working correctly.',
        credentials: { email: account.email, secret: token },
        providerOptions: { authMethod: 'oauth2' as const },
      });
      if (result.success) {
        return respondOk({ connected: true, message: 'Test email sent successfully. Check your inbox to confirm.' }, ctx.requestId);
      }
      throw new ExternalServiceError(result.error ?? 'Could not send test email. Please try reconnecting your Google account.');
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(error instanceof ReconnectRequiredError ? error.message : 'Could not verify Google authorization. Please try again.');
    }
  }

  // App password disabled — commented out for future re-enablement
  // if (!account.encrypted_secret) {
  //   return respondError(new ValidationError('No credentials stored for this account.'), ctx.requestId);
  // }
  //
  // const decryptedSecret = await decryptSecret(account.encrypted_secret, process.env.SMTP_ENCRYPTION_KEY!);
  //
  // const { GmailProvider } = await import('@/lib/email/providers/gmail');
  // const provider = new GmailProvider();
  // try {
  //   const result = await provider.testConnection({ email: account.email, secret: decryptedSecret });
  //   return respondOk({ connected: result.success, message: result.message }, ctx.requestId);
  // } catch (err) {
  //   if (err instanceof ExternalServiceError || err instanceof NotFoundError || err instanceof ValidationError) {
  //     return respondError(err, ctx.requestId);
  //   }
  //   return respondError(
  //     new ExternalServiceError("We couldn't connect to your email account. Please check your credentials."),
  //     ctx.requestId
  //   );
  // }
  return respondError(new ValidationError('App password authentication is disabled. Use Continue with Google.'), ctx.requestId);
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
