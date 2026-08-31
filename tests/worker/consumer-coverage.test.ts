import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockPrisma, createMockEnv, createMockStorageService } from '@/tests/mocks/helpers';
import { processQueueJob } from '@/lib/jobs/consumer';

vi.mock('@/lib/email/service', () => ({
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/security/encryption', () => ({
  decryptSecret: vi.fn().mockResolvedValue('dec-val'),
}));

vi.mock('@/lib/storage/storage.factory', () => ({
  createStorageService: vi.fn(),
}));

vi.mock('@/lib/limits/email-limit-service', () => ({
  reserveEmailCapacity: vi.fn(),
  commitReservation: vi.fn(),
  releaseReservation: vi.fn(),
}));

const MAX_ATTEMPTS = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sendEmail: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createStorageService: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let reserveEmailCapacity: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let commitReservation: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let releaseReservation: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let decryptSecret: any;

const baseJob = {
  id: 'job-1',
  status: 'QUEUED',
  user_id: 'user-1',
  campaign_id: null,
  campaign: null,
  to_email: 'test@example.com',
  subject: 'Subj',
  body: 'Body',
  email_account_id: 'account-1',
  resume_id: 'resume-1',
  attempt_count: 0,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPrisma(overrides: Record<string, any> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma = createMockPrisma() as any;
  prisma.emailJob.findUnique.mockResolvedValue({ ...baseJob, ...(overrides.job || {}) });
  prisma.emailJob.updateMany.mockResolvedValue({ count: 1 });
  prisma.emailJob.update.mockResolvedValue({});
  prisma.emailLog.create.mockResolvedValue({});
  prisma.user.findUnique.mockResolvedValue({ id: 'user-1', is_active: true });
  prisma.emailAccount.findUnique.mockResolvedValue({
    id: 'account-1',
    is_active: true,
    email: 'from@example.com',
    provider: 'gmail',
    encrypted_secret: 'secret',
  });
  prisma.resume.findUnique.mockResolvedValue({
    id: 'resume-1',
    filename: 'resume.pdf',
    storage_key: 'key',
    user_id: 'user-1',
    deleted_at: null,
  });
  prisma.campaign.findUnique.mockResolvedValue(null);
  for (const [k, v] of Object.entries(overrides)) {
    if (k === 'job') continue;
    prisma[k] = v;
  }
  return prisma;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getUpdate(prisma: any, status: string) {
  const call = prisma.emailJob.update.mock.calls.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) => c[0].data?.status === status
  );
  return call ? call[0].data : undefined;
}

beforeEach(async () => {
  const svc = await import('@/lib/email/service');
  const storage = await import('@/lib/storage/storage.factory');
  const lim = await import('@/lib/limits/email-limit-service');
  const enc = await import('@/lib/security/encryption');
  sendEmail = vi.mocked(svc.sendEmail);
  createStorageService = vi.mocked(storage.createStorageService);
  reserveEmailCapacity = vi.mocked(lim.reserveEmailCapacity);
  commitReservation = vi.mocked(lim.commitReservation);
  releaseReservation = vi.mocked(lim.releaseReservation);
  decryptSecret = vi.mocked(enc.decryptSecret);

  vi.clearAllMocks();

  decryptSecret.mockResolvedValue('dec-val');
  reserveEmailCapacity.mockResolvedValue({ success: true, reservationId: 'res-1' });
  commitReservation.mockResolvedValue(undefined);
  releaseReservation.mockResolvedValue(1);
  sendEmail.mockResolvedValue({ success: true });
  createStorageService.mockReturnValue(createMockStorageService());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('worker/consumer additional coverage', () => {
  it('returns early when the job is not found', async () => {
    const prisma = buildPrisma();
    prisma.emailJob.findUnique.mockResolvedValue(null);
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(prisma.emailJob.updateMany).not.toHaveBeenCalled();
    expect(reserveEmailCapacity).not.toHaveBeenCalled();
  });

  it('returns early when the job is no longer QUEUED (claimed.count === 0)', async () => {
    const prisma = buildPrisma();
    prisma.emailJob.updateMany.mockResolvedValue({ count: 0 });
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(reserveEmailCapacity).not.toHaveBeenCalled();
  });

  it('marks FAILED when the user is not found (inactive guard)', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique.mockResolvedValue(null);
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(getUpdate(prisma, 'FAILED')).toMatchObject({
      status: 'FAILED',
      error_message: 'User account is inactive.',
    });
  });

  it('marks FAILED when the user is inactive', async () => {
    const prisma = buildPrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', is_active: false });
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(getUpdate(prisma, 'FAILED')).toMatchObject({
      status: 'FAILED',
      error_message: 'User account is inactive.',
    });
  });

  it('marks CANCELLED when the campaign is PAUSED', async () => {
    const prisma = buildPrisma({
      job: { campaign_id: 'camp-1', campaign: { id: 'camp-1', status: 'PAUSED' } },
    });
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(getUpdate(prisma, 'CANCELLED')).toMatchObject({
      status: 'CANCELLED',
      error_message: 'Campaign is paused or cancelled.',
    });
  });

  it('marks CANCELLED when the campaign is CANCELLED', async () => {
    const prisma = buildPrisma({
      job: { campaign_id: 'camp-1', campaign: { id: 'camp-1', status: 'CANCELLED' } },
    });
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(getUpdate(prisma, 'CANCELLED')).toMatchObject({
      status: 'CANCELLED',
      error_message: 'Campaign is paused or cancelled.',
    });
  });

  it('marks RETRY_WAIT with next UTC midnight when reservation fails', async () => {
    const prisma = buildPrisma();
    reserveEmailCapacity.mockResolvedValue({ success: false, reason: 'quota' });
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    const data = getUpdate(prisma, 'RETRY_WAIT');
    expect(data).toBeDefined();
    const next = data.next_attempt_at as Date;
    expect(next.getUTCHours()).toBe(0);
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCSeconds()).toBe(0);
    const expected = new Date();
    expected.setUTCDate(expected.getUTCDate() + 1);
    expected.setUTCHours(0, 0, 0, 0);
    expect(next.getUTCDate()).toBe(expected.getUTCDate());
    expect(next.getUTCMonth()).toBe(expected.getUTCMonth());
  });

  it('marks FAILED when email account is missing and releases reservation', async () => {
    const prisma = buildPrisma();
    prisma.emailAccount.findUnique.mockResolvedValue(null);
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(getUpdate(prisma, 'FAILED')).toMatchObject({
      status: 'FAILED',
      error_message: 'Email account is inactive.',
    });
    expect(releaseReservation).toHaveBeenCalled();
  });

  it('marks FAILED when email account is inactive and releases reservation', async () => {
    const prisma = buildPrisma();
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: 'account-1',
      is_active: false,
      email: 'from@example.com',
      provider: 'gmail',
      encrypted_secret: 'secret',
    });
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(getUpdate(prisma, 'FAILED')).toMatchObject({
      status: 'FAILED',
      error_message: 'Email account is inactive.',
    });
    expect(releaseReservation).toHaveBeenCalled();
  });

  it('outer catch: resume missing (attempt < MAX) -> RETRY_WAIT + release', async () => {
    const prisma = buildPrisma();
    prisma.resume.findUnique.mockResolvedValue(null);
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(releaseReservation).toHaveBeenCalled();
    expect(getUpdate(prisma, 'RETRY_WAIT')).toMatchObject({
      status: 'RETRY_WAIT',
      error_message: 'A required email resource could not be loaded.',
    });
  });

  it('outer catch: resume missing (attempt >= MAX) -> FAILED + release', async () => {
    const prisma = buildPrisma({ job: { attempt_count: MAX_ATTEMPTS - 1 } });
    prisma.resume.findUnique.mockResolvedValue(null);
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(releaseReservation).toHaveBeenCalled();
    expect(getUpdate(prisma, 'FAILED')).toMatchObject({
      status: 'FAILED',
      error_message: 'A required email resource could not be loaded.',
    });
  });

  it('outer catch: storage download falsy stream -> RETRY_WAIT', async () => {
    const prisma = buildPrisma();
    createStorageService.mockReturnValue({
      ...createMockStorageService(),
      download: vi.fn().mockResolvedValue(null),
    });
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(releaseReservation).toHaveBeenCalled();
    expect(getUpdate(prisma, 'RETRY_WAIT')).toBeDefined();
  });

  it('provider permanent failure -> FAILED + SMTP_AUTH_FAILED log + release', async () => {
    const prisma = buildPrisma();
    sendEmail.mockResolvedValue({ success: false, errorType: 'permanent', error: 'auth failed' });
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(getUpdate(prisma, 'FAILED')).toMatchObject({ status: 'FAILED' });
    expect(releaseReservation).toHaveBeenCalled();
    const log = prisma.emailLog.create.mock.calls.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c[0].data?.status === 'SMTP_AUTH_FAILED'
    );
    expect(log).toBeDefined();
  });

  it('provider temporary failure (attempt 1) -> RETRY_WAIT + 2min backoff', async () => {
    const prisma = buildPrisma({ job: { attempt_count: 0 } });
    sendEmail.mockResolvedValue({ success: false, errorType: 'temporary', error: 'temp' });
    const before = Date.now();
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    const next = (getUpdate(prisma, 'RETRY_WAIT').next_attempt_at as Date).getTime();
    expect(Math.abs(next - (before + 2 * 60_000))).toBeLessThan(3000);
  });

  it('provider temporary failure (attempt 2) -> RETRY_WAIT + 5min backoff', async () => {
    const prisma = buildPrisma({ job: { attempt_count: 1 } });
    sendEmail.mockResolvedValue({ success: false, errorType: 'temporary', error: 'temp' });
    const before = Date.now();
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    const next = (getUpdate(prisma, 'RETRY_WAIT').next_attempt_at as Date).getTime();
    expect(Math.abs(next - (before + 5 * 60_000))).toBeLessThan(3000);
  });

  it('provider temporary failure (attempt >= MAX) -> FAILED', async () => {
    const prisma = buildPrisma({ job: { attempt_count: MAX_ATTEMPTS - 1 } });
    sendEmail.mockResolvedValue({ success: false, errorType: 'temporary', error: 'temp' });
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(getUpdate(prisma, 'FAILED')).toBeDefined();
  });

  it('inner catch: sendEmail throws, release/update/log reject -> .catch branches (attempt 1)', async () => {
    const prisma = buildPrisma({ job: { attempt_count: 0 } });
    sendEmail.mockRejectedValue(new Error('provider down'));
    releaseReservation.mockRejectedValue(new Error('rel fail'));
    prisma.emailJob.update.mockRejectedValue(new Error('upd fail'));
    prisma.emailLog.create.mockRejectedValue(new Error('log fail'));
    await expect(processQueueJob(prisma, createMockEnv(), 'job-1')).resolves.toBeUndefined();
    expect(releaseReservation).toHaveBeenCalled();
  });

  it('inner catch: sendEmail throws before acceptance (attempt 2 -> 5min)', async () => {
    const prisma = buildPrisma({ job: { attempt_count: 1 } });
    sendEmail.mockRejectedValue(new Error('provider down'));
    const before = Date.now();
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    const next = (getUpdate(prisma, 'RETRY_WAIT').next_attempt_at as Date).getTime();
    expect(Math.abs(next - (before + 5 * 60_000))).toBeLessThan(3000);
  });

  it('inner catch: sendEmail throws before acceptance (attempt >= MAX -> FAILED)', async () => {
    const prisma = buildPrisma({ job: { attempt_count: MAX_ATTEMPTS - 1 } });
    sendEmail.mockRejectedValue(new Error('provider down'));
    await processQueueJob(prisma, createMockEnv(), 'job-1');
    expect(getUpdate(prisma, 'FAILED')).toBeDefined();
  });

  describe('contentTypeForFilename', () => {
    const cases: Array<[string, string]> = [
      ['resume.pdf', 'application/pdf'],
      ['doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['doc.doc', 'application/msword'],
      ['note.txt', 'text/plain'],
      ['file.rtf', 'application/rtf'],
      ['weird.xyz', 'application/octet-stream'],
    ];
    for (const [filename, contentType] of cases) {
      it(`maps ${filename} -> ${contentType}`, async () => {
        const prisma = buildPrisma();
        prisma.resume.findUnique.mockResolvedValue({
          id: 'resume-1',
          filename,
          storage_key: 'key',
          user_id: 'user-1',
          deleted_at: null,
        });
        sendEmail.mockResolvedValue({ success: true });
        await processQueueJob(prisma, createMockEnv(), 'job-1');
        const call = sendEmail.mock.calls.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c: any) => c[0].attachment?.filename === filename
        );
        expect(call).toBeDefined();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((call as any)[0].attachment.contentType).toBe(contentType);
        expect(commitReservation).toHaveBeenCalled();
      });
    }
  });

  describe('encryptionKey', () => {
    it('uses the env arg when SMTP_ENCRYPTION_KEY is present', async () => {
      const prisma = buildPrisma();
      const key = 'env-secret-key';
      await processQueueJob(prisma, createMockEnv({ SMTP_ENCRYPTION_KEY: key }), 'job-1');
      expect(decryptSecret).toHaveBeenCalledWith('secret', key);
    });

    it('falls back to process.env when the env arg is missing', async () => {
      vi.stubEnv('SMTP_ENCRYPTION_KEY', 'process-env-secret');
      const prisma = buildPrisma();
      const env = createMockEnv({ SMTP_ENCRYPTION_KEY: undefined });
      await processQueueJob(prisma, env, 'job-1');
      expect(decryptSecret).toHaveBeenCalledWith('secret', 'process-env-secret');
    });

    it('throws when SMTP_ENCRYPTION_KEY is missing from both env arg and process.env', async () => {
      vi.stubEnv('SMTP_ENCRYPTION_KEY', '');
      const prisma = buildPrisma();
      const env = createMockEnv({ SMTP_ENCRYPTION_KEY: undefined });
      await processQueueJob(prisma, env, 'job-1');
      expect(decryptSecret).not.toHaveBeenCalled();
      expect(getUpdate(prisma, 'RETRY_WAIT')).toMatchObject({ status: 'RETRY_WAIT' });
    });
  });
});
