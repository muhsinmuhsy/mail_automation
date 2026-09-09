import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createCampaign } from '@/app/api/campaigns/route';
import { POST as preCheck } from '@/app/api/campaigns/pre-check/route';

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

const { mockRequireVerifiedSession, mockCheckApiRateLimit, mockGenerateCampaignJobs } = vi.hoisted(
  () => ({
    mockRequireVerifiedSession: vi.fn(),
    mockCheckApiRateLimit: vi.fn(),
    mockGenerateCampaignJobs: vi.fn(),
  })
);

const mockPrisma = {
  campaign: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  emailJob: { updateMany: vi.fn() },
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

vi.mock('@/lib/jobs/scheduler', () => ({ generateCampaignJobs: mockGenerateCampaignJobs }));
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
    ...overrides,
  };
}

beforeEach(() => {
  authenticated();
  mockCheckApiRateLimit.mockResolvedValue(null);
  mockGenerateCampaignJobs.mockResolvedValue(undefined);

  mockPrisma.campaign.create.mockResolvedValue({
    id: 'camp-1',
    name: 'Spring outreach',
    status: 'ACTIVE',
    created_at: new Date('2030-01-01'),
  });
  mockPrisma.emailAccount.findFirst.mockResolvedValue({ id: EMAIL_ACCOUNT_ID, user_id: 'user-1', provider: 'gmail' });
  mockPrisma.attachment.findFirst.mockResolvedValue(null);
  mockPrisma.contact.count.mockResolvedValue(2);
  mockPrisma.contact.findMany.mockResolvedValue([
    { id: CONTACT_ID_A, name: 'Ada', email: 'ada@example.com' },
    { id: CONTACT_ID_B, name: 'Grace', email: 'grace@example.com' },
  ]);
  mockPrisma.contactField.findMany.mockResolvedValue([]);
  mockPrisma.contactFieldValue.findMany.mockResolvedValue([]);
});

describe('POST /api/campaigns/pre-check — visual template body_html scanning (§10.1)', () => {
  it('detects missing custom field values referenced only in body_html', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      subject: 'Hello {{name}}',
      body: '',
      body_text: '',
      body_html: '<p>T-shirt size: {{t_shirt_size}}</p>',
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
    ]);

    const response = await preCheck(jsonRequest({
      templateId: TEMPLATE_ID,
      contactIds: [CONTACT_ID_A, CONTACT_ID_B],
    }, 'http://localhost/api/campaigns/pre-check'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { missingValues: Array<{ token: string; label: string; contactCount: number }> };
    expect(data.missingValues).toHaveLength(1);
    expect(data.missingValues[0]).toMatchObject({
      token: 't_shirt_size',
      label: 'T-shirt size',
      contactCount: 1,
    });
  });

  it('detects missing custom field values referenced only in body_text (fallback when body_html is null)', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      subject: 'Hello {{name}}',
      body: 'Legacy body without tokens',
      body_text: 'T-shirt size: {{t_shirt_size}}',
      body_html: null,
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
    ]);

    const response = await preCheck(jsonRequest({
      templateId: TEMPLATE_ID,
      contactIds: [CONTACT_ID_A, CONTACT_ID_B],
    }, 'http://localhost/api/campaigns/pre-check'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { missingValues: Array<{ token: string; contactCount: number }> };
    expect(data.missingValues).toHaveLength(1);
    expect(data.missingValues[0]).toMatchObject({ token: 't_shirt_size', contactCount: 1 });
  });

  it('falls back to body when body_html and body_text are both null (legacy template)', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      subject: 'Hello {{name}}',
      body: 'Size: {{t_shirt_size}}',
      body_text: null,
      body_html: null,
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
    ]);

    const response = await preCheck(jsonRequest({
      templateId: TEMPLATE_ID,
      contactIds: [CONTACT_ID_A, CONTACT_ID_B],
    }, 'http://localhost/api/campaigns/pre-check'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { missingValues: Array<{ token: string; contactCount: number }> };
    expect(data.missingValues).toHaveLength(1);
    expect(data.missingValues[0]).toMatchObject({ token: 't_shirt_size', contactCount: 1 });
  });

  it('prefers body_html over body_text and body when all are present', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      subject: 'Hello',
      body: 'No tokens here',
      body_text: 'No tokens here either',
      body_html: '<p>{{t_shirt_size}}</p>',
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([]);

    const response = await preCheck(jsonRequest({
      templateId: TEMPLATE_ID,
      contactIds: [CONTACT_ID_A, CONTACT_ID_B],
    }, 'http://localhost/api/campaigns/pre-check'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { missingValues: Array<{ token: string; contactCount: number }> };
    expect(data.missingValues).toHaveLength(1);
    expect(data.missingValues[0]).toMatchObject({ token: 't_shirt_size', contactCount: 2 });
  });

  it('reports no missing values when body_html has no tokens and body_text/body are empty', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      subject: 'Hello {{name}}',
      body: '',
      body_text: '',
      body_html: '<p>Static content, no merge tags.</p>',
    });

    const response = await preCheck(jsonRequest({
      templateId: TEMPLATE_ID,
      contactIds: [CONTACT_ID_A, CONTACT_ID_B],
    }, 'http://localhost/api/campaigns/pre-check'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      missingValues: [],
      unknownTokens: [],
      affectedContactCount: 0,
      totalContactCount: 2,
    });
  });

  it('selects body_text and body_html columns alongside body', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      subject: 'Hi',
      body: 'Hi',
      body_text: 'Hi',
      body_html: '<p>Hi</p>',
    });

    await preCheck(jsonRequest({
      templateId: TEMPLATE_ID,
      contactIds: [CONTACT_ID_A],
    }, 'http://localhost/api/campaigns/pre-check'));

    expect(mockPrisma.template.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        body: true,
        body_text: true,
        body_html: true,
      }),
    }));
  });
});

describe('POST /api/campaigns — visual template body_html scanning (§10.1)', () => {
  it('blocks campaign creation when body_html references a missing custom field and no action is chosen', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      user_id: 'user-1',
      subject: 'Hello {{name}}',
      body: '',
      body_text: '',
      body_html: '<p>T-shirt size: {{t_shirt_size}}</p>',
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
    ]);

    const response = await createCampaign(jsonRequest(validCreateBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('creates the campaign when body_html tokens are all satisfied', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      user_id: 'user-1',
      subject: 'Hello {{name}}',
      body: '',
      body_text: '',
      body_html: '<p>T-shirt size: {{t_shirt_size}}</p>',
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
      { contact_id: CONTACT_ID_B, field_id: FIELD_ID_SIZE, value: 'L' },
    ]);

    const response = await createCampaign(jsonRequest(validCreateBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockPrisma.campaign.create).toHaveBeenCalled();
  });

  it('creates the campaign for a legacy template (body_html/body_text null, tokens in body)', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      user_id: 'user-1',
      subject: 'Hello {{name}}',
      body: 'Size: {{t_shirt_size}}',
      body_text: null,
      body_html: null,
    });
    mockPrisma.contactField.findMany.mockResolvedValue([
      { id: FIELD_ID_SIZE, name: 't_shirt_size', label: 'T-shirt size' },
    ]);
    mockPrisma.contactFieldValue.findMany.mockResolvedValue([
      { contact_id: CONTACT_ID_A, field_id: FIELD_ID_SIZE, value: 'M' },
      { contact_id: CONTACT_ID_B, field_id: FIELD_ID_SIZE, value: 'L' },
    ]);

    const response = await createCampaign(jsonRequest(validCreateBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
  });
});
