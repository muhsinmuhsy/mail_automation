import { NextRequest, NextResponse } from 'next/server';
import { requireVerifiedUser } from '@/lib/api/session';
import { getPrisma } from '@/lib/db';
import { encryptSecret, decryptSecret } from '@/lib/security/encryption';
import { googleConfig, googleIdentity, requestTokens, GMAIL_SEND_SCOPE } from '@/lib/email/providers/gmail/oauth';
import { hashToken, OAUTH_COOKIE } from '@/lib/email/oauth/state';

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  // Fixed relative destination; never accept a return URL from the provider/browser.
  const destination = new URL('/email-accounts', req.url);
  let status = 'failed';
  try {
    const { provider } = await ctx.params;
    if (provider !== 'gmail') throw new Error('Unsupported provider.');
    const user = await requireVerifiedUser();
    const config = googleConfig(process.env, true);
    if (new URL(req.url).origin !== new URL(config.redirectUri).origin) throw new Error('Invalid origin.');
    const state = req.nextUrl.searchParams.get('state');
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || req.cookies.get(OAUTH_COOKIE)?.value !== state) throw new Error('Invalid authorization state.');
    const prisma = getPrisma();
    const stateHash = await hashToken(state);
    const attempt = await prisma.emailOAuthAttempt.findUnique({ where: { state_hash: stateHash } });
    if (!attempt || attempt.user_id !== user.id || attempt.provider !== provider || attempt.expires_at.getTime() <= Date.now()) throw new Error('Expired authorization state.');
    // Atomic consumption prevents callback replay, including parallel requests.
    const consumed = await prisma.emailOAuthAttempt.deleteMany({ where: { state_hash: stateHash, user_id: user.id, expires_at: { gt: new Date() } } });
    if (!consumed.count) throw new Error('Authorization already consumed.');
    if (req.nextUrl.searchParams.has('error')) {
      status = 'cancelled';
    } else {
      const code = req.nextUrl.searchParams.get('code');
      if (!code || code.length > 4096) throw new Error('Missing authorization code.');
      const key = process.env.SMTP_ENCRYPTION_KEY!;
      const tokens = await requestTokens(process.env, {
        grant_type: 'authorization_code', code, redirect_uri: config.redirectUri,
        code_verifier: await decryptSecret(attempt.encrypted_verifier, key),
      });
      const scopes = tokens.scope?.split(' ') ?? [];
      if (!scopes.includes(GMAIL_SEND_SCOPE) || !tokens.refresh_token) throw new Error('Sending permission and offline access are required.');
      const identity = await googleIdentity(tokens.access_token);
      const data = {
        auth_method: 'oauth2' as const, email: identity.email, provider_account_id: identity.sub,
        encrypted_secret: await encryptSecret(tokens.access_token, key),
        encrypted_refresh_token: await encryptSecret(tokens.refresh_token, key),
        access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
        granted_scopes: scopes, is_active: true, connection_error: null,
      };
      if (attempt.account_id) {
        const existing = await prisma.emailAccount.findFirst({ where: { id: attempt.account_id, user_id: user.id, provider: 'gmail' } });
        if (!existing || (existing.provider_account_id ? existing.provider_account_id !== identity.sub : existing.email.toLowerCase() !== identity.email)) {
          status = 'account_mismatch';
        } else {
          await prisma.emailAccount.update({ where: { id: existing.id }, data });
          status = 'connected';
        }
      } else {
        await prisma.emailAccount.upsert({
          where: { user_id_provider_email: { user_id: user.id, provider: 'gmail', email: identity.email } },
          create: { user_id: user.id, provider: 'gmail', ...data }, update: data,
        });
        status = 'connected';
      }
    }
  } catch {
    // Never log authorization codes, token responses, or provider error bodies.
    status = 'failed';
  }
  destination.searchParams.set('connection', status);
  const response = NextResponse.redirect(destination, 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.cookies.set(OAUTH_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/api/email-accounts', maxAge: 0 });
  return response;
}
