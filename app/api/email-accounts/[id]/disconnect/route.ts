import { NextRequest } from 'next/server';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { getPrisma } from '@/lib/db';
import { respondOk } from '@/lib/api/respond';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { decryptSecret } from '@/lib/security/encryption';
import { revokeGoogleToken } from '@/lib/email/providers/gmail/oauth';
import { idParamSchema } from '@/lib/validation/common';

const handler = defineRoute(async (_req, ctx) => {
  const parsed = idParamSchema.safeParse({ id: ctx.params.id });
  if (!parsed.success) throw new ValidationError('Invalid account.');
  const prisma = getPrisma();
  // Only the mailbox owner may manage its OAuth grant, including for admin sessions.
  const account = await prisma.emailAccount.findFirst({ where: { id: parsed.data.id, user_id: ctx.user.id } });
  if (!account) throw new NotFoundError('Email account not found.');
  await prisma.emailAccount.update({ where: { id: account.id }, data: {
    is_active: false, encrypted_secret: null, encrypted_refresh_token: null,
    access_token_expires_at: null, granted_scopes: [], connection_error: 'disconnected',
  } });
  let revoked = true;
  if (account.provider === 'gmail' && account.auth_method === 'oauth2' && account.encrypted_refresh_token) {
    try { revoked = await revokeGoogleToken(await decryptSecret(account.encrypted_refresh_token, process.env.SMTP_ENCRYPTION_KEY!)); }
    catch { revoked = false; }
  }
  return respondOk({ revoked }, ctx.requestId, revoked ? 'Account disconnected. An email already being sent may still complete.' : 'Account disconnected locally. Remove access in your Google Account settings to finish revoking permission.');
}, { auth: 'user', rateLimitKey: 'email-oauth-disconnect' });

export async function POST(req: NextRequest, ctx: { params: RouteParams }) { return handler(req, ctx); }
