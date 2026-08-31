import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { updateEmailAccountSecretSchema } from '@/lib/validation/email-account';
import { encryptSecret } from '@/lib/security/encryption';
import { NotFoundError, ValidationError, AppError } from '@/lib/errors';

const _PATCH = defineRoute(async (req, ctx) => {
  const parsedId = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsedId.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const body = await req.json().catch(() => null);
  const parsedBody = updateEmailAccountSecretSchema.safeParse(body);
  if (!parsedBody.success) {
    return respondError(new ValidationError('App password is required.'), ctx.requestId);
  }

  const account = await getPrisma().emailAccount.findUnique({
    where: { id: parsedId.data.id },
  });

  if (!account) {
    return respondError(new NotFoundError('Email account not found.'), ctx.requestId);
  }

  if (!account.is_active) {
    return respondError(
      new AppError(
        'Cannot update the app password of a deactivated account. Reactivate it first.',
        400,
        'BUSINESS_ERROR'
      ),
      ctx.requestId
    );
  }

  const encryptedSecret = await encryptSecret(parsedBody.data.secret, process.env.SMTP_ENCRYPTION_KEY!);

  await getPrisma().emailAccount.update({
    where: { id: parsedId.data.id },
    data: { encrypted_secret: encryptedSecret },
  });

  return respondOk(null, ctx.requestId, 'App password updated.');
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
  rateLimitKey: 'email-account-update',
});

const _DELETE = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) {
    return respondError(new ValidationError('Invalid ID.'), ctx.requestId);
  }

  const emailAccount = await getPrisma().emailAccount.findUnique({
    where: { id: parsed.data.id },
  });

  if (!emailAccount) {
    return respondError(new NotFoundError('Email account not found.'), ctx.requestId);
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
    return respondOk(null, ctx.requestId, 'Email account deactivated and retained for pending email jobs.');
  }

  await getPrisma().emailAccount.update({
    where: { id: parsed.data.id },
    data: { is_active: false },
  });

  return respondOk(null, ctx.requestId, 'Email account deactivated.');
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
  rateLimitKey: 'email-account-delete',
});


export async function PATCH(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _PATCH(req, ctx);
}


export async function DELETE(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _DELETE(req, ctx);
}
