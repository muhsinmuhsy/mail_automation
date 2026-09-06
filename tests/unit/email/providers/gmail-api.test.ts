import { describe, it, expect, vi } from 'vitest';
import { GmailApiProvider } from '@/lib/email/providers/gmail/provider';
import { EmailProviderFactory } from '@/lib/email/providers/factory';
import { buildMimeMessage } from '@/lib/email/mime';
import { authorizationUrl, googleConfig, requestTokens, googleIdentity, GMAIL_SEND_SCOPE, ReconnectRequiredError } from '@/lib/email/providers/gmail/oauth';
import { hashToken, base64url } from '@/lib/email/oauth/state';

const env = { GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REDIRECT_URI: 'http://localhost:3000/api/email-accounts/callback/gmail', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' };
const input = { from: 'me@gmail.com', to: 'you@example.com', subject: 'Hello', body: 'Hi', mimeMessage: 'Subject: Hello\r\n\r\nHello 世界', credentials: { email: 'me@gmail.com', secret: 'token' } };

describe('Gmail API and authorization protocol', () => {
  it('encodes a maximum-size attachment without exceeding argument limits', () => {
    const attachment = new Uint8Array(5 * 1024 * 1024).fill(255);
    const encoded = base64url(attachment);
    expect(Buffer.from(encoded, 'base64url').equals(Buffer.from(attachment))).toBe(true);
    expect(encoded).not.toMatch(/[+/=]/);
  });
  it('uses sending and identity scopes with offline access, state and PKCE', async () => {
    const url = new URL(authorizationUrl(googleConfig(env, true), 'state', await hashToken('verifier')));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(['openid', 'email', GMAIL_SEND_SCOPE]);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('state');
    expect(url.toString()).not.toContain('client_secret');
  });
  it.each(['https://evil.example/api/email-accounts/callback/gmail', 'http://localhost:3000/wrong', 'http://localhost:3000/api/email-accounts/callback/gmail?next=evil'])('rejects an unsafe callback %s', redirect => {
    expect(() => googleConfig({ ...env, GOOGLE_REDIRECT_URI: redirect }, true)).toThrow();
  });
  it('resolves OAuth through the Gmail REST adapter', () => {
    expect(EmailProviderFactory.resolve('gmail', { authMethod: 'oauth2' })).toBeInstanceOf(GmailApiProvider);
  });
  it('sends base64url MIME with UTF-8 and attachments via the Bearer header', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'gmail-message-id' }));
    const mimeMessage = buildMimeMessage({ from: input.from, to: input.to, subject: '世界', body: input.body,
      attachments: [{ filename: 'file.pdf', contentType: 'application/pdf', content: new Uint8Array([1, 2, 3]) }] });
    const result = await new GmailApiProvider(fetcher).sendEmail({ ...input, mimeMessage });
    expect(result).toMatchObject({ success: true, messageId: 'gmail-message-id' });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer token' });
    const raw = JSON.parse(String(options?.body)).raw;
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(raw, 'base64url').toString('utf8')).toBe(mimeMessage);
    expect(mimeMessage).toContain('file.pdf');
  });
  it.each([[429, 'temporary'], [503, 'temporary'], [400, 'permanent'], [403, 'permanent']])('classifies HTTP %s', async (status, errorType) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { message: 'secret raw error' } }, { status: Number(status) }));
    const result = await new GmailApiProvider(fetcher).sendEmail(input);
    expect(result.errorType).toBe(errorType);
    expect(result.error).not.toContain('secret raw error');
  });
  it('recognizes rate limiting inside a 403 response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, { status: 403 }));
    expect((await new GmailApiProvider(fetcher).sendEmail(input)).errorType).toBe('temporary');
  });
  it('requests reconnection on 401', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 401 }));
    expect(await new GmailApiProvider(fetcher).sendEmail(input)).toMatchObject({ reconnectRequired: true, errorType: 'permanent' });
  });
  it('does not retry an ambiguous timeout', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('timeout'));
    expect((await new GmailApiProvider(fetcher).sendEmail(input)).errorType).toBe('unknown');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('records acceptance even if the successful response body is unreadable', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('not json', { status: 200 }));
    expect((await new GmailApiProvider(fetcher).sendEmail(input)).success).toBe(true);
  });
  it('does not submit missing credentials', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await new GmailApiProvider(fetcher).sendEmail({ ...input, credentials: undefined })).success).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('exchanges tokens server-side and sanitizes failures', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ access_token: 'new', expires_in: 3600 }));
    await expect(requestTokens(env, { grant_type: 'refresh_token', refresh_token: 'refresh' }, fetcher)).resolves.toMatchObject({ access_token: 'new' });
    expect(fetcher.mock.calls[0][1]?.body).toBeInstanceOf(URLSearchParams);
    fetcher.mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }));
    await expect(requestTokens(env, {}, fetcher)).rejects.toBeInstanceOf(ReconnectRequiredError);
    fetcher.mockResolvedValue(Response.json({ error: 'invalid_client', error_description: 'secret' }, { status: 400 }));
    await expect(requestTokens(env, {}, fetcher)).rejects.toThrow('temporarily unavailable');
  });
  it('rejects unverified account identity', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ sub: 'id', email: 'me@gmail.com', email_verified: false }));
    await expect(googleIdentity('token', fetcher)).rejects.toThrow('verified email');
  });
});
