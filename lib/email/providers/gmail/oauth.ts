import { z } from 'zod';
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const GMAIL_SCOPES = ['openid', 'email', GMAIL_SEND_SCOPE];

export class ReconnectRequiredError extends Error {
  constructor() { super('Gmail authorization expired or was revoked. Reconnect your account.'); }
}

export function googleConfig(env: Record<string, unknown>, callback = false) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (typeof clientId !== 'string' || !clientId || typeof clientSecret !== 'string' || !clientSecret) {
    throw new Error('Google OAuth is not configured.');
  }
  const redirectUri = typeof env.GOOGLE_REDIRECT_URI === 'string' ? env.GOOGLE_REDIRECT_URI : '';
  if (callback) {
    const url = new URL(redirectUri);
    const app = new URL(String(env.NEXT_PUBLIC_APP_URL));
    if (url.origin !== app.origin || url.pathname !== '/api/email-accounts/callback/gmail' || url.search || url.hash ||
        url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
      throw new Error('Google OAuth redirect configuration is invalid.');
    }
  }
  return { clientId, clientSecret, redirectUri };
}

export function authorizationUrl(config: ReturnType<typeof googleConfig>, state: string, challenge: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: 'code', scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent select_account',
    state, code_challenge: challenge, code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export async function requestTokens(env: Record<string, unknown>, fields: Record<string, string>, fetcher: typeof fetch = fetch): Promise<GoogleTokens> {
  const config = googleConfig(env);
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...fields }),
  });
  const raw = await response.json().catch(() => ({}));
  const data = z.record(z.unknown()).parse(raw);
  if (!response.ok) {
    if (data.error === 'invalid_grant') throw new ReconnectRequiredError();
    throw new Error('Google authorization is temporarily unavailable.');
  }
  if (typeof data.access_token !== 'string' || !data.access_token || typeof data.expires_in !== 'number' || data.expires_in <= 0 ||
      (data.refresh_token !== undefined && typeof data.refresh_token !== 'string') || (data.scope !== undefined && typeof data.scope !== 'string')) {
    throw new Error('Google returned an invalid authorization response.');
  }
  return { access_token: data.access_token, expires_in: data.expires_in,
    ...(typeof data.refresh_token === 'string' ? { refresh_token: data.refresh_token } : {}),
    ...(typeof data.scope === 'string' ? { scope: data.scope } : {}) };
}

export async function googleIdentity(accessToken: string, fetcher: typeof fetch = fetch): Promise<{ sub: string; email: string }> {
  const response = await fetcher('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401) throw new ReconnectRequiredError();
  if (!response.ok) throw new Error('Could not verify the Google account.');
  const data = z.record(z.unknown()).parse(await response.json());
  if (typeof data.sub !== 'string' || !data.sub || typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email_verified !== true) {
    throw new Error('Google did not provide a verified email address.');
  }
  return { sub: data.sub, email: data.email.toLowerCase() };
}

export async function revokeGoogleToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }), signal: AbortSignal.timeout(15000),
    });
    return response.ok || response.status === 400;
  } catch { return false; }
}
