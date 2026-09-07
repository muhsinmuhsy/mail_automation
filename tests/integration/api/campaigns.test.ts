import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET as listCampaigns, POST as createCampaign } from '@/app/api/campaigns/route';
import { GET as getCampaignOptions } from '@/app/api/campaigns/options/route';
import { GET as getCampaign } from '@/app/api/campaigns/[id]/route';
import { POST as pauseCampaign } from '@/app/api/campaigns/[id]/pause/route';
import { POST as cancelCampaign } from '@/app/api/campaigns/[id]/cancel/route';
import { POST as resumeCampaign } from '@/app/api/campaigns/[id]/resume/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  pagination?: { total: number; page: number; pageSize: number; totalPages: number };
  error?: { type: string; message: string; fields?: Record<string, string>; retryAfter?: number };
}

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const EMAIL_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const ATTACHMENT_ID = '33333333-3333-4333-8333-333333333333';
const TEMPLATE_ID = '44444444-4444-4444-8444-444444444444';
const CONTACT_ID_A = '55555555-5555-4555-8555-555555555555';
const CONTACT_ID_B = '66666666-6666-4666-8666-666666666666';

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
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  emailJob: {
    updateMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  emailAccount: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  attachment: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  template: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  contact: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  $disconnect: vi.fn(),
};
mockPrisma.campaign.findUnique = mockPrisma.campaign.findFirst;

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: mockRequireVerifiedSession,
  getSession: vi.fn(async () => {
    const result = await mockRequireVerifiedSession();
    return 'session' in result ? result.session : null;
  }),
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: mockCheckApiRateLimit,
}));

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

vi.mock('@/lib/jobs/scheduler', () => ({
  generateCampaignJobs: mockGenerateCampaignJobs,
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

function authenticated(): void {
  mockRequireVerifiedSession.mockResolvedValue({
    session: { user: { id: 'user-1', email: 'user@example.com', emailVerified: true } },
  });
}

function unauthenticated(): void {
  mockRequireVerifiedSession.mockResolvedValue({
    error: { type: 'AUTHENTICATION_ERROR', message: 'Please log in to continue.' },
  });
}

function unverified(): void {
  mockRequireVerifiedSession.mockResolvedValue({
    error: { type: 'AUTHORIZATION_ERROR', message: 'Please verify your email address to continue.' },
  });
}

function rateLimited(): void {
  mockCheckApiRateLimit.mockResolvedValue(
    NextResponse.json(
      { success: false, error: { type: 'RATE_LIMITED', message: 'Too fast.', retryAfter: 60 } },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  );
}

function validCreateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Spring outreach',
    email_account_id: EMAIL_ACCOUNT_ID,
    attachment_id: ATTACHMENT_ID,
    template_id: TEMPLATE_ID,
    contact_ids: [CONTACT_ID_A],
    start_at: '2030-01-01T09:00:00.000Z',
    timezone: 'UTC',
    interval_minutes: 5,
    daily_limit: 10,
    ...overrides,
  };
}

function jsonRequest(body: unknown, url = 'http://localhost/api/campaigns'): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  authenticated();
  mockCheckApiRateLimit.mockResolvedValue(null);
  mockGenerateCampaignJobs.mockResolvedValue(undefined);

  mockPrisma.campaign.findMany.mockResolvedValue([
    { id: CAMPAIGN_ID, name: 'Spring outreach', status: 'ACTIVE', created_at: new Date('2030-01-01') },
  ]);
  mockPrisma.campaign.count.mockResolvedValue(1);
  mockPrisma.campaign.findFirst.mockResolvedValue({
    id: CAMPAIGN_ID,
    user_id: 'user-1',
    name: 'Spring outreach',
    status: 'ACTIVE',
  });
  mockPrisma.campaign.create.mockResolvedValue({
    id: CAMPAIGN_ID,
    name: 'Spring outreach',
    status: 'DRAFT',
    created_at: new Date('2030-01-01'),
  });
  mockPrisma.campaign.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.emailJob.updateMany.mockResolvedValue({ count: 3 });
  mockPrisma.emailAccount.findFirst.mockResolvedValue({ id: EMAIL_ACCOUNT_ID, user_id: 'user-1', provider: 'gmail' });
  mockPrisma.attachment.findFirst.mockResolvedValue({ id: ATTACHMENT_ID, user_id: 'user-1' });
  mockPrisma.template.findFirst.mockResolvedValue({ id: TEMPLATE_ID, user_id: 'user-1' });
  mockPrisma.contact.count.mockResolvedValue(1);
});

describe('GET /api/campaigns/options', () => {
  it('returns only owned, enabled sender choices and no sensitive account fields', async () => {
    mockPrisma.emailAccount.findMany.mockResolvedValue([{ id: EMAIL_ACCOUNT_ID, email: 'me@gmail.com', provider: 'gmail' }, { id: 'future', email: 'me@outlook.com', provider: 'microsoft' }]);
    mockPrisma.attachment.findMany.mockResolvedValue([{ id: ATTACHMENT_ID, filename: 'notes.txt', size_bytes: 12 }]);
    mockPrisma.template.findMany.mockResolvedValue([]);
    mockPrisma.contact.findMany.mockResolvedValue([]);
    const response = await getCampaignOptions(new NextRequest('http://localhost/api/campaigns/options'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json() as { data: { emailAccounts: unknown[]; attachments: { size_bytes: number }[] } };
    expect(body.data.emailAccounts).toEqual([{ id: EMAIL_ACCOUNT_ID, label: 'me@gmail.com', provider: 'gmail' }]);
    expect(body.data.attachments[0].size_bytes).toBe(12);
    for (const model of [mockPrisma.emailAccount, mockPrisma.attachment, mockPrisma.template, mockPrisma.contact]) {
      expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ user_id: 'user-1' }) }));
    }
  });
  it('requires authentication', async () => {
    unauthenticated();
    expect((await getCampaignOptions(new NextRequest('http://localhost/api/campaigns/options'))).status).toBe(401);
    expect(mockPrisma.emailAccount.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/campaigns', () => {
  it('returns the paginated campaign list scoped to the current user', async () => {
    const response = await listCampaigns(new NextRequest('http://localhost/api/campaigns'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual({ total: 1, page: 1, pageSize: 20, totalPages: 1 });
    expect(response.headers.get('X-Request-ID')).toBeTruthy();
    expect(mockPrisma.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-1' },
        select: expect.objectContaining({ start_at: true, timezone: true, interval_minutes: true, daily_limit: true }),
        skip: 0,
        take: 20,
        orderBy: { created_at: 'desc' },
      })
    );
  });

  it('applies page and limit to skip/take and reports totalPages', async () => {
    mockPrisma.campaign.count.mockResolvedValue(42);

    const response = await listCampaigns(
      new NextRequest('http://localhost/api/campaigns?page=3&limit=10')
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.pagination).toEqual({ total: 42, page: 3, pageSize: 10, totalPages: 5 });
    expect(mockPrisma.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 })
    );
  });

  it('applies a case-insensitive name search', async () => {
    await listCampaigns(new NextRequest('http://localhost/api/campaigns?search=%20spring%20'));

    const where = mockPrisma.campaign.findMany.mock.calls[0][0].where;
    expect(where.name).toEqual({ contains: 'spring', mode: 'insensitive' });
  });

  it('filters by a known status value', async () => {
    await listCampaigns(new NextRequest('http://localhost/api/campaigns?status=PAUSED'));

    const where = mockPrisma.campaign.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PAUSED');
  });

  it('ignores an unknown status value', async () => {
    await listCampaigns(new NextRequest('http://localhost/api/campaigns?status=BOGUS'));

    const where = mockPrisma.campaign.findMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
  });

  it('returns 401 when the request is not authenticated', async () => {
    unauthenticated();

    const response = await listCampaigns(new NextRequest('http://localhost/api/campaigns'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
    expect(mockPrisma.campaign.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 when the user email is not verified', async () => {
    unverified();

    const response = await listCampaigns(new NextRequest('http://localhost/api/campaigns'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when the database query fails', async () => {
    mockPrisma.campaign.findMany.mockRejectedValue(new Error('connection lost'));

    const response = await listCampaigns(new NextRequest('http://localhost/api/campaigns'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('POST /api/campaigns', () => {
  it.each([{ ids: [] }, { ids: [ATTACHMENT_ID, CONTACT_ID_B] }])('persists and schedules optional attachment arrays $ids', async ({ ids }) => {
    const body = validCreateBody({ attachment_ids: ids });
    delete body.attachment_id;
    const response = await createCampaign(jsonRequest(body));
    expect(response.status).toBe(201);
    expect(mockPrisma.campaign.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attachment_id: null, attachment_ids: ids }) }));
    expect(mockGenerateCampaignJobs).toHaveBeenCalledWith(mockPrisma, expect.objectContaining({ attachment_ids: ids }), [CONTACT_ID_A]);
    expect(mockPrisma.attachment.findFirst).toHaveBeenCalledTimes(ids.length);
  });
  it('rejects an inaccessible file among multiple selected attachments', async () => {
    mockPrisma.attachment.findFirst.mockResolvedValueOnce({ size_bytes: 1 }).mockResolvedValueOnce(null);
    const body = validCreateBody({ attachment_ids: [ATTACHMENT_ID, CONTACT_ID_B] });
    delete body.attachment_id;
    expect((await createCampaign(jsonRequest(body))).status).toBe(403);
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });
  it('enforces combined attachment bytes on the server', async () => {
    mockPrisma.attachment.findFirst.mockResolvedValue({ size_bytes: 11 * 1024 * 1024 });
    const body = validCreateBody({ attachment_ids: [ATTACHMENT_ID, CONTACT_ID_B] });
    delete body.attachment_id;
    expect((await createCampaign(jsonRequest(body))).status).toBe(400);
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });
  it('creates a campaign and schedules its jobs', async () => {
    const response = await createCampaign(jsonRequest(validCreateBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Campaign created successfully.');
    expect(mockPrisma.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'user-1',
          name: 'Spring outreach',
          email_account_id: EMAIL_ACCOUNT_ID,
          attachment_id: ATTACHMENT_ID,
          template_id: TEMPLATE_ID,
          timezone: 'UTC',
          interval_minutes: 5,
          daily_limit: 10,
        }),
      })
    );
    expect(mockGenerateCampaignJobs).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({ id: CAMPAIGN_ID, user_id: 'user-1' }),
      [CONTACT_ID_A]
    );
  });

  it('applies schema defaults and treats a missing daily_limit as undefined', async () => {
    mockPrisma.contact.count.mockResolvedValue(2);

    const body = validCreateBody({ contact_ids: [CONTACT_ID_A, CONTACT_ID_B] });
    delete body.daily_limit;
    delete body.timezone;
    delete body.interval_minutes;

    const response = await createCampaign(jsonRequest(body));

    expect(response.status).toBe(201);
    expect(mockPrisma.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timezone: 'UTC',
          interval_minutes: 5,
          daily_limit: undefined,
        }),
      })
    );
  });

  it('returns 400 VALIDATION_ERROR for an invalid body', async () => {
    const response = await createCampaign(
      jsonRequest({ name: '', email_account_id: 'nope', contact_ids: [] })
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toBe('Please correct the highlighted fields.');
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('returns 403 when the email account does not belong to the user', async () => {
    mockPrisma.emailAccount.findFirst.mockResolvedValue(null);

    const response = await createCampaign(jsonRequest(validCreateBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(body.error?.message).toBe('Email account not found or does not belong to you.');
  });

  it('returns 403 when the attachment does not belong to the user', async () => {
    mockPrisma.attachment.findFirst.mockResolvedValue(null);

    const response = await createCampaign(jsonRequest(validCreateBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.message).toBe('Attachment not found or does not belong to you.');
  });

  it('returns 403 when the template does not belong to the user', async () => {
    mockPrisma.template.findFirst.mockResolvedValue(null);

    const response = await createCampaign(jsonRequest(validCreateBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.message).toBe('Template not found or does not belong to you.');
  });

  it('returns 403 when one or more contacts do not belong to the user', async () => {
    mockPrisma.contact.count.mockResolvedValue(1);

    const response = await createCampaign(
      jsonRequest(validCreateBody({ contact_ids: [CONTACT_ID_A, CONTACT_ID_B] }))
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.message).toBe('One or more contacts do not belong to you.');
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('returns the rate-limit response when the limiter rejects the request', async () => {
    rateLimited();

    const response = await createCampaign(jsonRequest(validCreateBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(429);
    expect(body.error?.type).toBe('RATE_LIMITED');
    expect(mockPrisma.campaign.create).not.toHaveBeenCalled();
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await createCampaign(jsonRequest(validCreateBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(mockCheckApiRateLimit).not.toHaveBeenCalled();
  });

  it('returns 500 when job generation fails', async () => {
    mockGenerateCampaignJobs.mockRejectedValue(new Error('scheduler exploded'));

    const response = await createCampaign(jsonRequest(validCreateBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('GET /api/campaigns/[id]', () => {
  it('returns the campaign when it belongs to the user', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({
      id: CAMPAIGN_ID,
      user_id: 'user-1',
      name: 'Spring outreach',
      status: 'ACTIVE',
    });

    const response = await getCampaign(
      new NextRequest(`http://localhost/api/campaigns/${CAMPAIGN_ID}`),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: CAMPAIGN_ID, name: 'Spring outreach' });
    expect(mockPrisma.campaign.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CAMPAIGN_ID } })
    );
  });

  it('returns 404 when the campaign is missing or owned by someone else', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(null);

    const response = await getCampaign(
      new NextRequest(`http://localhost/api/campaigns/${CAMPAIGN_ID}`),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(body.error?.message).toBe('Campaign not found.');
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await getCampaign(new NextRequest('http://localhost/api/campaigns/nope'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.campaign.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'nope' } })
    );
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await getCampaign(
      new NextRequest(`http://localhost/api/campaigns/${CAMPAIGN_ID}`),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });
});

const transitions = [
  { label: 'pause', handler: pauseCampaign, from: 'ACTIVE', whereStatus: 'ACTIVE', status: 'PAUSED', message: 'Campaign paused.' },
  { label: 'cancel', handler: cancelCampaign, from: 'ACTIVE', whereStatus: ['DRAFT', 'ACTIVE', 'PAUSED'], status: 'CANCELLED', message: 'Campaign cancelled.' },
  { label: 'resume', handler: resumeCampaign, from: 'PAUSED', whereStatus: 'PAUSED', status: 'ACTIVE', message: 'Campaign resumed.' },
] as const;

describe.each(transitions)('POST /api/campaigns/[id]/$label', ({ handler, from, whereStatus, status, message, label }) => {
  const url = `http://localhost/api/campaigns/${CAMPAIGN_ID}/action`;

  it('updates the campaign status and returns a confirmation message', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({
      id: CAMPAIGN_ID,
      user_id: 'user-1',
      name: 'Spring outreach',
      status: from,
    });

    const response = await handler(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
    expect(body.message).toBe(message);
    expect(mockPrisma.campaign.updateMany).toHaveBeenCalledWith({
      where: Array.isArray(whereStatus)
        ? { id: CAMPAIGN_ID, status: { in: whereStatus } }
        : { id: CAMPAIGN_ID, status: whereStatus },
      data: { status },
    });
    if (label === 'cancel') {
      expect(mockPrisma.emailJob.updateMany).toHaveBeenCalledWith({
        where: { campaign_id: CAMPAIGN_ID, status: 'SCHEDULED' },
        data: { status: 'CANCELLED', error_message: 'Campaign was cancelled.' },
      });
    }
  });

  it('returns 404 when no owned campaign matched', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(null);

    const response = await handler(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
  });

  it('returns 409 for an invalid lifecycle transition', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({
      id: CAMPAIGN_ID,
      user_id: 'user-1',
      name: 'Spring outreach',
      status: label === 'resume' ? 'ACTIVE' : 'COMPLETED',
    });

    const response = await handler(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.error?.type).toBe('BUSINESS_ERROR');
    expect(mockPrisma.campaign.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await handler(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: '123' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.campaign.updateMany).not.toHaveBeenCalled();
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await handler(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(429);
    expect(body.error?.type).toBe('RATE_LIMITED');
    expect(mockPrisma.campaign.updateMany).not.toHaveBeenCalled();
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await handler(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when the update fails', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({
      id: CAMPAIGN_ID,
      user_id: 'user-1',
      name: 'Spring outreach',
      status: from,
    });
    mockPrisma.campaign.updateMany.mockRejectedValue(new Error('db down'));

    const response = await handler(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});
