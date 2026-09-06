import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as connect } from '@/app/api/email-accounts/connect/[provider]/route';
import { GET as callback } from '@/app/api/email-accounts/callback/[provider]/route';
import { POST as disconnect } from '@/app/api/email-accounts/[id]/disconnect/route';
import { POST as createAccount } from '@/app/api/email-accounts/route';
import { hashToken, OAUTH_COOKIE } from '@/lib/email/oauth/state';
import { encryptSecret, decryptSecret } from '@/lib/security/encryption';
import { GMAIL_SEND_SCOPE } from '@/lib/email/providers/gmail/oauth';

const mocks = vi.hoisted(() => ({
  user: vi.fn(), attempt: { create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
  account: { findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn(), create: vi.fn() }, fetch: vi.fn<typeof fetch>(),
}));
vi.mock('@/lib/api/session', () => ({ requireVerifiedUser: mocks.user }));
vi.mock('@/lib/auth/guards', () => ({ requireUser: mocks.user, requireAdmin: vi.fn(), getDbRole: vi.fn() }));
vi.mock('@/lib/rate-limit/middleware', () => ({ enforceRateLimit: vi.fn() }));
vi.mock('@/lib/db', () => ({ getPrisma: () => ({ emailOAuthAttempt: mocks.attempt, emailAccount: mocks.account }) }));

const key = 'a'.repeat(64);
const origin = 'http://localhost:3000';
const id = '11111111-1111-4111-8111-111111111111';
const state = 'a'.repeat(43);
const context = { params: Promise.resolve({ provider: 'gmail' }) };
function callbackRequest(query = `state=${state}&code=code`, cookie = state) {
  return new NextRequest(`${origin}/api/email-accounts/callback/gmail?${query}`, { headers: { cookie: `${OAUTH_COOKIE}=${cookie}` } });
}
beforeEach(async () => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client'); vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret');
  vi.stubEnv('GOOGLE_REDIRECT_URI', `${origin}/api/email-accounts/callback/gmail`);
  vi.stubEnv('NEXT_PUBLIC_APP_URL', origin); vi.stubEnv('SMTP_ENCRYPTION_KEY', key);
  vi.stubGlobal('fetch', mocks.fetch); mocks.fetch.mockReset();
  mocks.user.mockReset().mockResolvedValue({ id: 'user-1', emailVerified: true });
  for (const mock of Object.values(mocks.attempt)) mock.mockReset();
  for (const mock of Object.values(mocks.account)) mock.mockReset();
  mocks.attempt.deleteMany.mockResolvedValue({ count: 1 });
  mocks.attempt.findUnique.mockResolvedValue({ state_hash: await hashToken(state), user_id: 'user-1', provider: 'gmail', account_id: null, encrypted_verifier: await encryptSecret('verifier', key), expires_at: new Date(Date.now() + 600000) });
  mocks.fetch.mockImplementation(async url => String(url).endsWith('/token')
    ? Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, scope: `openid email ${GMAIL_SEND_SCOPE}` })
    : Response.json({ sub: 'google-id', email: 'Sender@gmail.com', email_verified: true }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Gmail OAuth account endpoints', () => {
  it('reports unavailable setup without exposing configuration secrets', async () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    const response = await connect(new NextRequest(`${origin}/api/email-accounts/connect/gmail`, { method: 'POST', body: '{}' }), context);
    expect(response.status).toBe(502);
    expect(await response.text()).toContain('Gmail connection is unavailable');
    expect(mocks.attempt.create).not.toHaveBeenCalled();
  });
  it('starts authorization with a protected cookie and encrypted PKCE verifier', async () => {
    const response = await connect(new NextRequest(`${origin}/api/email-accounts/connect/gmail`, { method: 'POST', body: '{}' }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=lax');
    const body = await response.json() as { data: { url: string } };
    const url = new URL(body.data.url);
    const attempt = mocks.attempt.create.mock.calls[0][0].data;
    expect(attempt.state_hash).toBe(await hashToken(url.searchParams.get('state')!));
    const verifier = await decryptSecret(attempt.encrypted_verifier, key);
    expect(url.searchParams.get('code_challenge')).toBe(await hashToken(verifier));
    expect(JSON.stringify(body)).not.toContain('client_secret');
  });
  it('rejects cross-origin connection initiation', async () => {
    const response = await connect(new NextRequest(`${origin}/api/email-accounts/connect/gmail`, { method: 'POST', headers: { cookie: 'session=1', origin: 'https://evil.example' } }), context);
    expect(response.status).toBe(403);
    expect(mocks.attempt.create).not.toHaveBeenCalled();
  });
  it('blocks future providers', async () => {
    const response = await connect(new NextRequest(`${origin}/api/email-accounts/connect/microsoft`, { method: 'POST' }), { params: Promise.resolve({ provider: 'microsoft' }) });
    expect(response.status).toBe(400);
  });
  it('connects the verified Google identity and encrypts both tokens', async () => {
    const response = await callback(callbackRequest(), context);
    expect(response.headers.get('location')).toBe(`${origin}/email-accounts?connection=connected`);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    const saved = mocks.account.upsert.mock.calls[0][0].create;
    expect(saved).toMatchObject({ user_id: 'user-1', email: 'sender@gmail.com', auth_method: 'oauth2', provider_account_id: 'google-id' });
    expect(await decryptSecret(saved.encrypted_secret, key)).toBe('access');
    expect(await decryptSecret(saved.encrypted_refresh_token, key)).toBe('refresh');
    expect(response.headers.get('location')).not.toContain('code=');
  });
  it.each(['wrong-cookie', 'wrong-user', 'expired', 'replay'])('rejects %s before token exchange', async reason => {
    if (reason === 'wrong-user') mocks.user.mockResolvedValue({ id: 'another-user' });
    if (reason === 'expired') mocks.attempt.findUnique.mockResolvedValue({ user_id: 'user-1', provider: 'gmail', expires_at: new Date(0) });
    if (reason === 'replay') mocks.attempt.deleteMany.mockResolvedValue({ count: 0 });
    const response = await callback(callbackRequest(undefined, reason === 'wrong-cookie' ? 'wrong' : state), context);
    expect(response.headers.get('location')).toContain('connection=failed');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.account.upsert).not.toHaveBeenCalled();
  });
  it('handles denied consent without exchanging tokens', async () => {
    const response = await callback(callbackRequest(`state=${state}&error=access_denied`), context);
    expect(response.headers.get('location')).toContain('connection=cancelled');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each(['scope', 'refresh'])('does not save incomplete authorization: %s', async missing => {
    mocks.fetch.mockResolvedValue(Response.json({ access_token: 'access', expires_in: 3600, scope: missing === 'scope' ? 'openid email' : GMAIL_SEND_SCOPE, ...(missing === 'refresh' ? {} : { refresh_token: 'refresh' }) }));
    expect((await callback(callbackRequest(), context)).headers.get('location')).toContain('connection=failed');
    expect(mocks.account.upsert).not.toHaveBeenCalled();
  });
  it('prevents reconnecting an existing campaign account as another Google account', async () => {
    const attempt = await mocks.attempt.findUnique();
    mocks.attempt.findUnique.mockResolvedValue({ ...attempt, account_id: id });
    mocks.account.findFirst.mockResolvedValue({ id, provider_account_id: 'different-google-id', email: 'other@gmail.com' });
    expect((await callback(callbackRequest(), context)).headers.get('location')).toContain('connection=account_mismatch');
    expect(mocks.account.update).not.toHaveBeenCalled();
  });
  it('updates the same account ID during SMTP-to-OAuth migration', async () => {
    const attempt = await mocks.attempt.findUnique();
    mocks.attempt.findUnique.mockResolvedValue({ ...attempt, account_id: id });
    mocks.account.findFirst.mockResolvedValue({ id, provider_account_id: null, email: 'sender@gmail.com' });
    await callback(callbackRequest(), context);
    expect(mocks.account.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id }, data: expect.objectContaining({ auth_method: 'oauth2' }) }));
  });
  it('disconnects locally before revoking and never returns the tokens', async () => {
    mocks.account.findFirst.mockResolvedValue({ id, provider: 'gmail', auth_method: 'oauth2', encrypted_refresh_token: await encryptSecret('refresh', key) });
    mocks.fetch.mockImplementation(async () => {
      expect(mocks.account.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ encrypted_refresh_token: null, is_active: false }) }));
      return new Response(null, { status: 200 });
    });
    const response = await disconnect(new NextRequest(`${origin}/api/email-accounts/${id}/disconnect`, { method: 'POST' }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('refresh');
  });
  it('cannot disconnect another user’s account', async () => {
    mocks.account.findFirst.mockResolvedValue(null);
    expect((await disconnect(new NextRequest(`${origin}/api/email-accounts/${id}/disconnect`, { method: 'POST' }), { params: Promise.resolve({ id }) })).status).toBe(404);
    expect(mocks.account.update).not.toHaveBeenCalled();
  });
  it.each([['gmail', 'oauth2'], ['microsoft', 'password'], ['gmail', 'password']])('rejects manually posted %s/%s credentials', async (provider, auth_method) => {
    const response = await createAccount(new NextRequest(`${origin}/api/email-accounts`, { method: 'POST', body: JSON.stringify({ provider, auth_method, email: 'me@gmail.com', secret: 'fake' }) }));
    expect(response.status).toBe(400);
    expect(mocks.account.create).not.toHaveBeenCalled();
  });
});
