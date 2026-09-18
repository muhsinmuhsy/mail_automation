import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@/lib/generated/prisma/client';
import { processQueueJob } from '@/lib/jobs/consumer';
import { ReconnectRequiredError } from '@/lib/email/providers/gmail/oauth';

const mocks = vi.hoisted(() => ({ send: vi.fn(), token: vi.fn(), reserve: vi.fn(), release: vi.fn(), commit: vi.fn() }));
vi.mock('@/lib/email/service', () => ({ sendEmail: mocks.send }));
vi.mock('@/lib/email/accounts/credential-service', () => ({ gmailAccessToken: mocks.token }));
vi.mock('@/lib/limits/email-limit-service', () => ({ reserveEmailCapacity: mocks.reserve, releaseReservation: mocks.release, commitReservation: mocks.commit }));
vi.mock('@/lib/storage/storage.factory', () => ({ createStorageService: () => ({ download: async () => new Blob(['pdf']).stream() }) }));
vi.mock('@/lib/security/encryption', () => ({ decryptSecret: async () => 'token' }));

const account = { id: 'account', email: 'me@gmail.com', provider: 'gmail', auth_method: 'oauth2', is_active: true, encrypted_secret: 'encrypted', updated_at: new Date() };
const db = {
  emailJob: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() }, emailAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
  attachment: { findUnique: vi.fn() }, emailLog: { create: vi.fn() },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockReset(); mocks.token.mockReset().mockResolvedValue('token');
  mocks.reserve.mockResolvedValue({ success: true });
  mocks.release.mockResolvedValue(undefined);
  db.emailJob.findUnique.mockResolvedValue({ id: 'job', user_id: 'user', email_account_id: 'account', attachment_id: 'attachment', to_email: 'recipient@example.com', subject: 'subject', body: 'body', attempt_count: 0 });
  db.emailJob.updateMany.mockResolvedValue({ count: 1 });
  db.emailJob.update.mockReset().mockResolvedValue({});
  db.emailLog.create.mockResolvedValue({});
  db.user.findUnique.mockResolvedValue({ is_active: true });
  db.emailAccount.findUnique.mockResolvedValue(account);
  db.attachment.findUnique.mockResolvedValue({ filename: 'file.pdf', storage_key: 'file' });
});
const run = () => processQueueJob(db as unknown as PrismaClient, { SMTP_ENCRYPTION_KEY: 'key' }, 'job');

describe('Gmail OAuth queue consumer', () => {
  it.each([{ ids: [] }, { ids: ['one', 'two'] }])('sends the selected attachment collection $ids', async ({ ids }) => {
    const job = await db.emailJob.findUnique();
    db.emailJob.findUnique.mockResolvedValue({ ...job, attachment_id: null, attachment_ids: ids });
    mocks.send.mockResolvedValue({ success: true });
    await run();
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ attachments: expect.any(Array) }));
    expect(mocks.send.mock.calls[0][0].attachments).toHaveLength(ids.length);
    expect(db.attachment.findUnique).toHaveBeenCalledTimes(ids.length);
    for (const id of ids) expect(db.attachment.findUnique).toHaveBeenCalledWith({ where: { id, user_id: 'user', deleted_at: null } });
  });
  it('does not send when a selected attachment is missing', async () => {
    db.attachment.findUnique.mockResolvedValue(null);
    await run();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalled();
  });
  it('dispatches OAuth credentials and commits accepted usage', async () => {
    mocks.send.mockResolvedValue({ success: true, messageId: 'google-id', providerResponse: 'Accepted' });
    await run();
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ providerOptions: { authMethod: 'oauth2' }, credentials: { email: account.email, secret: 'token' } }));
    expect(db.emailJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }));
    expect(mocks.commit).toHaveBeenCalledOnce(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it('retains quota and never retries an unknown send outcome', async () => {
    mocks.send.mockResolvedValue({ success: false, errorType: 'unknown' });
    await run();
    expect(db.emailJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERY_UNKNOWN' }) }));
    expect(mocks.release).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('retries an explicit Gmail rate limit and releases the reservation', async () => {
    mocks.send.mockResolvedValue({ success: false, errorType: 'temporary' });
    await run();
    expect(db.emailJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'RETRY_WAIT' }) }));
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it('retains the reservation even if recording an unknown outcome fails', async () => {
    mocks.send.mockResolvedValue({ success: false, errorType: 'unknown' });
    db.emailJob.update.mockRejectedValue(new Error('database unavailable'));
    await expect(run()).rejects.toThrow('requires recovery');
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it('refreshes once after an explicit unauthorized response', async () => {
    mocks.send.mockResolvedValueOnce({ success: false, errorType: 'permanent', reconnectRequired: true }).mockResolvedValueOnce({ success: true });
    await run();
    expect(mocks.token).toHaveBeenLastCalledWith(expect.anything(), account, expect.anything(), true);
    expect(mocks.send).toHaveBeenCalledTimes(2); expect(mocks.commit).toHaveBeenCalledOnce();
  });
  it('stops and releases capacity when refresh authorization has been revoked', async () => {
    mocks.token.mockRejectedValue(new ReconnectRequiredError());
    await run();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(db.emailJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
