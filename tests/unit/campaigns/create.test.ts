import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecipientPreviewChangedError } from '@/lib/errors';
import { computePreviewFingerprint } from '@/lib/campaigns/fingerprint';

const { mockTx, mockPrisma, mockComputeEligibility, mockCreateJobs } = vi.hoisted(() => {
  const mockTx = {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    campaignSubmission: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(undefined),
    },
    campaign: {
      create: vi.fn().mockResolvedValue({
        id: 'campaign-123',
        name: 'Test Campaign',
        _count: { email_jobs: 0 },
      }),
    },
  };
  const mockPrisma = {
    $transaction: vi.fn(async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
  };
  return {
    mockTx,
    mockPrisma,
    mockComputeEligibility: vi.fn(),
    mockCreateJobs: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/db', () => ({
  getPrisma: () => mockPrisma,
  TransactionClient: {} as never,
}));

vi.mock('@/lib/jobs/scheduler', () => ({
  createCampaignJobsFromSnapshot: mockCreateJobs,
}));

vi.mock('@/lib/campaigns/eligibility', () => ({
  computeEligibility: mockComputeEligibility,
}));

const { createCampaign } = await import('@/lib/campaigns/create');

type CreateCampaignInput = Parameters<typeof createCampaign>[0];

const baseEligibilityResult = {
  summary: {
    policyVersion: 1,
    checkedAt: new Date().toISOString(),
    selectedCount: 1,
    eligibleCount: 1,
    excludedCount: 0,
    excludedByReason: {
      duplicateAddress: 0,
      previouslySent: 0,
      pending: 0,
      deliveryUnknown: 0,
      missingValues: 0,
    },
    includedPreviousCount: 0,
    includedWithoutPreviousSendCount: 1,
    blockedByUnknownTokens: false,
    recipients: [],
    missingValues: [],
    unknownTokens: [],
    affectedContactCount: 0,
    totalContactCount: 1,
  },
  preparedJobs: [
    {
      contactId: '00000000-0000-0000-0000-000000000001',
      toEmail: 'alice@example.com',
      normalizedEmail: 'alice@example.com',
      subject: 'Hello Alice',
      body: 'Body for Alice',
      bodyHtml: null,
      scheduledAt: new Date('2026-09-13T12:00:00Z'),
      creationKey: '',
    },
  ],
  validatedResendRecipients: [],
  followUpSentJobIds: [],
};

function makeInput(overrides: Partial<CreateCampaignInput> = {}): CreateCampaignInput {
  return {
    userId: '00000000-0000-0000-0000-000000000010',
    templateId: '00000000-0000-0000-0000-000000000020',
    emailAccountId: '00000000-0000-0000-0000-000000000030',
    contactIds: ['00000000-0000-0000-0000-000000000001'],
    attachmentIds: [],
    resendRecipients: [],
    missingValueAction: 'exclude',
    unknownTokenAction: 'fix',
    startAt: new Date('2026-09-13T12:00:00Z'),
    timezone: 'UTC',
    intervalMinutes: 5,
    dailyLimit: null,
    name: 'Test Campaign',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    previewFingerprint: 'a'.repeat(64),
    ...overrides,
  };
}

const fingerprintInput = {
  templateId: '00000000-0000-0000-0000-000000000020',
  emailAccountId: '00000000-0000-0000-0000-000000000030',
  attachmentIds: [] as string[],
  contactIds: ['00000000-0000-0000-0000-000000000001'],
  resendRecipients: [] as Array<{ contactId: string; recipientEmail: string }>,
  missingValueAction: 'exclude' as const,
  unknownTokenAction: 'fix' as const,
  eligibleRecipients: [
    {
      contactId: '00000000-0000-0000-0000-000000000001',
      recipientEmail: 'alice@example.com',
      subject: 'Hello Alice',
      bodyText: 'Body for Alice',
      bodyHtml: null,
    },
  ],
  includedPreviousCount: 0,
  includedWithoutPreviousSendCount: 1,
  followUpSentJobIds: [] as string[],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.campaignSubmission.findUnique.mockResolvedValue(null);
  mockComputeEligibility.mockResolvedValue(baseEligibilityResult);
});

describe('createCampaign — stale fingerprint rejection (Fix #1)', () => {
  it('throws RecipientPreviewChangedError when previewFingerprint does not match recomputed fingerprint', async () => {
    const correctFingerprint = await computePreviewFingerprint(fingerprintInput);
    const staleFingerprint = 'b'.repeat(64);
    expect(staleFingerprint).not.toBe(correctFingerprint);

    const input = makeInput({ previewFingerprint: staleFingerprint });
    await expect(createCampaign(input)).rejects.toThrow(RecipientPreviewChangedError);
  });

  it('succeeds when previewFingerprint matches the recomputed fingerprint', async () => {
    const correctFingerprint = await computePreviewFingerprint(fingerprintInput);
    const input = makeInput({ previewFingerprint: correctFingerprint });
    const result = await createCampaign(input);
    expect(result.status).toBe('created');
    expect(result.campaignId).toBe('campaign-123');
  });

  it('recomputes fingerprint from eligibility result preparedJobs, not from input', async () => {
    const differentJobsResult = {
      ...baseEligibilityResult,
      preparedJobs: [
        {
          ...baseEligibilityResult.preparedJobs[0],
          subject: 'DIFFERENT SUBJECT',
        },
      ],
    };
    mockComputeEligibility.mockResolvedValue(differentJobsResult);

    const correctFingerprintForOriginalJobs = await computePreviewFingerprint(fingerprintInput);
    const input = makeInput({ previewFingerprint: correctFingerprintForOriginalJobs });
    await expect(createCampaign(input)).rejects.toThrow(RecipientPreviewChangedError);
  });
});
