import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createCampaign } from '@/app/api/campaigns/route';
import { POST as preCheck } from '@/app/api/campaigns/pre-check/route';
import { ValidationError } from '@/lib/errors';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: { type: string; message: string; fields?: Record<string, string>; details?: unknown };
}

const TEMPLATE_ID = '44444444-4444-4444-8444-444444444444';
const EMAIL_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const CONTACT_ID_A = '55555555-5555-4555-8555-555555555555';
const CONTACT_ID_B = '66666666-6666-4666-8666-666666666666';
const FIELD_ID_SIZE = '77777777-7777-4777-8777-777777777777';

const { mockRequireVerifiedSession, mockCheckApiRateLimit, mockCreateCampaign } = vi.hoisted(
  () => ({
    mockRequireVerifiedSession: vi.fn(),
    mockCheckApiRateLimit: vi.fn(),
    mockCreateCampaign: vi.fn(),
  })
);

const mockPrisma = {
  campaign: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  emailJob: { updateMany: vi.fn(), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  emailAccount: { findMany: vi.fn(), findFirst: vi.fn() },
  attachment: { findMany: vi.fn(), findFirst: vi.fn() },
  template: { findMany: vi.fn(), findFirst: vi.fn() },
  contact: { findMany: vi.fn(), count: vi.fn() },
  contactField: { findMany: vi.fn().mockResolvedValue([]) },
  contactFieldValue: { findMany: vi.fn().mockResolvedValue([]) },
  $queryRaw: vi.fn().mockResolvedValue([]),
  $executeRaw: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn(),
};

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: mockRequireVerifiedSession,
  getSession: vi.fn(async () => {
    const result = await mockRequireVerifiedSession();
    return 'session' in result ? result.session : null;
  }),
}));

vi.mock('@/lib/rate-limit/api', () => ({ checkApiRateLimit: mockCheckApiRateLimit }));

vi.mock('@/lib/rate-limit/middleware', () => ({
  enforceRateLimit: vi.fn(async (identifier: string, key: string) => {
    const res = await mockCheckApiRateLimit({}, identifier, key);
    if (res) {
      const { RateLimitError } = await import('@/lib/errors');
      throw new RateLimitError(
        "You're doing that too frequently. Please wait a moment and try again.",
        60
      );
    }
  }),
}));

vi.mock('@/lib/campaigns/create', () => ({ createCampaign: mockCreateCampaign }));
vi.mock('@/lib/db', () => ({ getPrisma: vi.fn(() => mockPrisma) }));

function authenticated(): void {
  mockRequireVerifiedSession.mockResolvedValue({
    session: { user: { id: 'user-1', email: 'user@example.com', emailVerified: true } },
  });
}

function jsonRequest(body: unknown, url = 'http://localhost/api/campaigns'): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function validCreateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Spring outreach',
    email_account_id: EMAIL_ACCOUNT_ID,
    template_id: TEMPLATE_ID,
    contact_ids: [CONTACT_ID_A, CONTACT_ID_B],
    start_at: '2030-01-01T09:00:00.000Z',
    timezone: 'UTC',
    interval_minutes: 5,
    daily_limit: 10,
    idempotency_key: '11111111-1111-4111-8111-111111111111',
    preview_fingerprint: 'a'.repeat(64),
    ...overrides,
  };
}

beforeEach(() => {
  authenticated();
  mockCheckApiRateLimit.mockResolvedValue(null);
  mockCreateCampaign.mockResolvedValue({
    campaignId: 'camp-1',
    campaignName: 'Spring outreach',
    status: 'created',
    recipientSummary: {
      policyVersion: 1,
      selectedCount: 2,
      eligibleCount: 2,
      excludedCount: 0,
      excludedByReason: { duplicateAddress: 0, previouslySent: 0, pending: 0, deliveryUnknown: 0, missingValues: 0 },
      includedPreviousCount: 0,
      includedWithoutPreviousSendCount: 2,
      blockedByUnknownTokens: false,
      recipients: [],
      missingValues: [],
      unknownTokens: [],
      affectedContactCount: 0,
      totalContactCount: 2,
    },
    jobCount: 2,
  });

  mockPrisma.campaign.create.mockResolvedValue({
    id: 'camp-1',
    name: 'Spring outreach',
    status: 'ACTIVE',
    created_at: new Date('2030-01-01'),
  });
  mockPrisma.campaign.findUniqueOrThrow.mockResolvedValue({
    id: 'camp-1',
    name: 'Spring outreach',
    status: 'ACTIVE',
    created_at: new Date('2030-01-01'),
    _count: { email_jobs: 2 },
  });
  mockPrisma.emailAccount.findFirst.mockResolvedValue({ id: EMAIL_ACCOUNT_ID, user_id: 'user-1', provider: 'gmail' });
  mockPrisma.attachment.findFirst.mockResolvedValue(null);
  mockPrisma.contact.count.mockResolvedValue(2);
  mockPrisma.contact.findMany.mockResolvedValue([
    { id: CONTACT_ID_A, name: 'Ada', email: 'ada@example.com', contact_field_values: [] },
    { id: CONTACT_ID_B, name: 'Grace', email: 'grace@example.com', contact_field_values: [] },
  ]);
  mockPrisma.contactField.findMany.mockResolvedValue([]);
  mockPrisma.contactFieldValue.findMany.mockResolvedValue([]);
});

describe('POST /api/campaigns/pre-check', () => {
  it('returns no missing values when all template tokens are present', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID, subject: 'Hello {{name}}', body: 'Hi {{name}}',
    });

    const response = await preCheck(jsonRequest({
      templateId: TEMPLATE_ID,
      emailAccountId: EMAIL_ACCOUNT_ID,
      contactIds: [CONTACT_ID_A, CONTACT_ID_B],
    }, 'http://localhost/api/campaigns/pre-check'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      missingValues: [],
      unknownTokens: [],
      affectedContactCount: 0,
      totalContactCount: 2,
    });
  });

  it('detects missing custom field values', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID, subject: 'Hello {{name}}', body: 'Size: {{t_shirt_size}}',
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
    ]);
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: CONTACT_ID_A, name: 'Ada', email: 'ada@example.com', contact_field_values: [{ field_id: FIELD_ID_SIZE, value: 'M' }] },
      { id: CONTACT_ID_B, name: 'Grace', email: 'grace@example.com', contact_field_values: [] },
    ]);

    const response = await preCheck(jsonRequest({
      templateId: TEMPLATE_ID,
      emailAccountId: EMAIL_ACCOUNT_ID,
      contactIds: [CONTACT_ID_A, CONTACT_ID_B],
    }, 'http://localhost/api/campaigns/pre-check'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { missingValues: Array<{ token: string; label: string; contactCount: number }> };
    expect(data.missingValues).toHaveLength(1);
    expect(data.missingValues[0]).toMatchObject({ token: 't_shirt_size', label: 'T-shirt size', contactCount: 1 });
  });

  it('reports unknown tokens for deleted fields', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID, subject: 'Hello {{name}}', body: 'Old: {{deleted_field}}',
    });
    mockPrisma.contact.count.mockResolvedValue(1);

    const response = await preCheck(jsonRequest({
      templateId: TEMPLATE_ID,
      emailAccountId: EMAIL_ACCOUNT_ID,
      contactIds: [CONTACT_ID_A],
    }, 'http://localhost/api/campaigns/pre-check'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { unknownTokens: string[]; missingValues: unknown[] };
    expect(data.unknownTokens).toEqual(['{{deleted_field}}']);
    expect(data.missingValues).toHaveLength(0);
  });

  it('scans both subject and body for tokens', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID, subject: 'Size: {{t_shirt_size}}', body: 'Hi {{name}}',
    });
    mockPrisma.contact.count.mockResolvedValue(1);
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
    ]);
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: CONTACT_ID_A, name: 'Ada', email: 'ada@example.com', contact_field_values: [{ field_id: FIELD_ID_SIZE, value: 'M' }] },
      { id: CONTACT_ID_B, name: 'Grace', email: 'grace@example.com', contact_field_values: [] },
    ]);

    const response = await preCheck(jsonRequest({
      templateId: TEMPLATE_ID,
      emailAccountId: EMAIL_ACCOUNT_ID,
      contactIds: [CONTACT_ID_B],
    }, 'http://localhost/api/campaigns/pre-check'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { missingValues: Array<{ token: string }> };
    expect(data.missingValues).toHaveLength(1);
    expect(data.missingValues[0].token).toBe('t_shirt_size');
  });

  it('returns 403 when the template does not belong to the user', async () => {
    mockPrisma.template.findFirst.mockResolvedValue(null);

    const response = await preCheck(jsonRequest({
      templateId: TEMPLATE_ID,
      emailAccountId: EMAIL_ACCOUNT_ID,
      contactIds: [CONTACT_ID_A],
    }, 'http://localhost/api/campaigns/pre-check'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.message).toBe('Template not found or does not belong to you.');
  });

  it('returns 403 when contacts do not belong to the user', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({ id: TEMPLATE_ID, subject: 'Hi', body: 'Hi' });
    mockPrisma.contact.count.mockResolvedValue(1);

    const response = await preCheck(jsonRequest({
      templateId: TEMPLATE_ID,
      emailAccountId: EMAIL_ACCOUNT_ID,
      contactIds: [CONTACT_ID_A, CONTACT_ID_B],
    }, 'http://localhost/api/campaigns/pre-check'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.message).toBe('One or more contacts do not belong to you.');
  });
});

describe('POST /api/campaigns — missingValueAction recheck', () => {
  it('returns 400 with pre-check result when missing values exist and action is absent', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID, subject: 'Hello {{name}}', body: 'Size: {{t_shirt_size}}',
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
    ]);
    mockCreateCampaign.mockRejectedValueOnce(new ValidationError('Some recipients have missing values.'));

    const response = await createCampaign(jsonRequest(validCreateBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toContain('missing values');
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('proceeds when missingValueAction is "continue"', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID, subject: 'Hello {{name}}', body: 'Size: {{t_shirt_size}}',
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
    ]);

    const response = await createCampaign(jsonRequest(validCreateBody({ missing_value_action: 'continue' })));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockCreateCampaign).toHaveBeenCalled();
  });

  it('proceeds when missingValueAction is "exclude" and contacts are filtered', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID, subject: 'Hello {{name}}', body: 'Size: {{t_shirt_size}}',
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
    ]);
    mockPrisma.contact.count.mockResolvedValue(1);

    const response = await createCampaign(jsonRequest(validCreateBody({
      contact_ids: [CONTACT_ID_A],
      missing_value_action: 'exclude',
    })));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('returns 400 when "exclude" is submitted but unfiltered contacts remain', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID, subject: 'Hello {{name}}', body: 'Size: {{t_shirt_size}}',
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
    ]);
    mockCreateCampaign.mockRejectedValueOnce(new ValidationError('Some contacts still have missing values.'));

    const response = await createCampaign(jsonRequest(validCreateBody({
      contact_ids: [CONTACT_ID_A, CONTACT_ID_B],
      missing_value_action: 'exclude',
    })));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toContain('still have missing values');
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('returns 400 when "exclude" filters all contacts (zero-recipient guard)', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID, subject: 'Hello {{name}}', body: 'Size: {{t_shirt_size}}',
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
    ]);
    mockPrisma.contact.count.mockResolvedValue(1);
    mockCreateCampaign.mockRejectedValueOnce(new ValidationError('No recipients remaining after filtering.'));

    const response = await createCampaign(jsonRequest(validCreateBody({
      contact_ids: [CONTACT_ID_B],
      missing_value_action: 'exclude',
    })));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toContain('No recipients remaining');
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('proceeds when there are no missing values regardless of action', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID, subject: 'Hello {{name}}', body: 'Hi {{name}}',
    });

    const response = await createCampaign(jsonRequest(validCreateBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
  });
});
