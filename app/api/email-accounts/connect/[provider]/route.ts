import { NextRequest, NextResponse } from 'next/server';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { getPrisma } from '@/lib/db';
import { ValidationError, ExternalServiceError } from '@/lib/errors';
import { encryptSecret } from '@/lib/security/encryption';
import { authorizationUrl, googleConfig } from '@/lib/email/providers/gmail/oauth';
import { hashToken, randomToken, OAUTH_COOKIE, OAUTH_TTL_SECONDS } from '@/lib/email/oauth/state';
import { z } from 'zod';

const handler = defineRoute(async (req, ctx) => {
  if (ctx.params.provider !== 'gmail') throw new ValidationError('This provider is not available yet.');
  let config: ReturnType<typeof googleConfig>;
  try { config = googleConfig(process.env, true); }
  catch { throw new ExternalServiceError('Gmail connection is unavailable. Please contact the application administrator.'); }
  if (new URL(req.url).origin !== new URL(config.redirectUri).origin) throw new ValidationError('Open the application at its configured address before connecting Gmail.');
  const parsed = z.object({ accountId: z.string().uuid().optional() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) throw new ValidationError('Invalid email account.');
  const prisma = getPrisma();
  if (parsed.data.accountId) {
    const account = await prisma.emailAccount.findFirst({ where: { id: parsed.data.accountId, user_id: ctx.user.id, provider: 'gmail' } });
    if (!account) throw new ValidationError('Email account not found.');
  }
  const state = randomToken();
  const verifier = randomToken();
  await prisma.emailOAuthAttempt.deleteMany({ where: { OR: [{ expires_at: { lt: new Date() } }, { user_id: ctx.user.id }] } });
  await prisma.emailOAuthAttempt.create({ data: {
    state_hash: await hashToken(state), user_id: ctx.user.id, provider: 'gmail', account_id: parsed.data.accountId,
    encrypted_verifier: await encryptSecret(verifier, process.env.SMTP_ENCRYPTION_KEY!),
    expires_at: new Date(Date.now() + OAUTH_TTL_SECONDS * 1000),
  } });
  const response = NextResponse.json({ success: true, data: { url: authorizationUrl(config, state, await hashToken(verifier)) } });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(OAUTH_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: new URL(config.redirectUri).protocol === 'https:', path: '/api/email-accounts', maxAge: OAUTH_TTL_SECONDS });
  return response;
}, { auth: 'user', rateLimitKey: 'email-oauth-connect' });

export async function POST(req: NextRequest, ctx: { params: RouteParams }) { return handler(req, ctx); }
