import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient, EmailAccount } from '@/lib/generated/prisma/client';
import { gmailAccessToken } from '@/lib/email/accounts/credential-service';
import { encryptSecret, decryptSecret } from '@/lib/security/encryption';
import { GMAIL_SEND_SCOPE, ReconnectRequiredError } from '@/lib/email/providers/gmail/oauth';

const env = { SMTP_ENCRYPTION_KEY: 'a'.repeat(64), GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret' };
const updateMany = vi.fn();
const findUnique = vi.fn();
const prisma = { emailAccount: { updateMany, findUnique } } as unknown as PrismaClient;
let account: EmailAccount;
const fetcher = vi.fn<typeof fetch>();

beforeEach(async () => {
  vi.stubGlobal('fetch', fetcher);
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  findUnique.mockReset(); fetcher.mockReset();
  account = { id: 'id', user_id: 'owner', provider: 'gmail', email: 'me@gmail.com', auth_method: 'oauth2',
    is_active: true, encrypted_secret: await encryptSecret('access', env.SMTP_ENCRYPTION_KEY),
    encrypted_refresh_token: await encryptSecret('refresh', env.SMTP_ENCRYPTION_KEY),
    access_token_expires_at: new Date(Date.now() + 3600000), granted_scopes: [GMAIL_SEND_SCOPE],
    provider_account_id: 'sub', connection_error: null, created_at: new Date(), updated_at: new Date() };
});
afterEach(() => vi.unstubAllGlobals());

describe('Gmail encrypted credential lifecycle', () => {
  it('reuses a valid encrypted access token without a request', async () => {
    expect(await gmailAccessToken(prisma, account, env)).toBe('access');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('refreshes expiry and preserves an omitted refresh token', async () => {
    account.access_token_expires_at = new Date(0);
    fetcher.mockResolvedValue(Response.json({ access_token: 'new-access', expires_in: 3600 }));
    expect(await gmailAccessToken(prisma, account, env)).toBe('new-access');
    const update = updateMany.mock.calls[0][0];
    expect(update.data.encrypted_refresh_token).toBeUndefined();
    expect(await decryptSecret(update.data.encrypted_secret, env.SMTP_ENCRYPTION_KEY)).toBe('new-access');
    expect(update.where).toMatchObject({ is_active: true, updated_at: account.updated_at });
  });
  it('encrypts a rotated refresh token', async () => {
    fetcher.mockResolvedValue(Response.json({ access_token: 'new', refresh_token: 'rotated', expires_in: 3600 }));
    await gmailAccessToken(prisma, account, env, true);
    expect(await decryptSecret(updateMany.mock.calls[0][0].data.encrypted_refresh_token, env.SMTP_ENCRYPTION_KEY)).toBe('rotated');
  });
  it('disables sending when Google revokes the grant', async () => {
    fetcher.mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }));
    await expect(gmailAccessToken(prisma, account, env, true)).rejects.toBeInstanceOf(ReconnectRequiredError);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ is_active: false, connection_error: 'reconnect_required' }) }));
  });
  it('never restores tokens after a concurrent disconnect', async () => {
    fetcher.mockResolvedValue(Response.json({ access_token: 'new', expires_in: 3600 }));
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue({ ...account, is_active: false, encrypted_secret: null });
    await expect(gmailAccessToken(prisma, account, env, true)).rejects.toBeInstanceOf(ReconnectRequiredError);
  });
  it('uses the winning refresh when another worker updates first', async () => {
    fetcher.mockResolvedValue(Response.json({ access_token: 'losing', expires_in: 3600 }));
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue(account);
    expect(await gmailAccessToken(prisma, account, env, true)).toBe('access');
  });
  it('does not deactivate an account for temporary token endpoint failures', async () => {
    fetcher.mockResolvedValue(Response.json({}, { status: 503 }));
    await expect(gmailAccessToken(prisma, account, env, true)).rejects.toThrow('temporarily unavailable');
    expect(updateMany).not.toHaveBeenCalled();
  });
});
