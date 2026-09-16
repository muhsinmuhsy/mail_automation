import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST as retryFailed } from '@/app/api/campaigns/[id]/retry-failed/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: { type: string; message: string; fields?: Record<string, string>; retryAfter?: number };
}

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';

const { mockRequireVerifiedSession, mockCheckApiRateLimit } = vi.hoisted(
  () => ({
    mockRequireVerifiedSession: vi.fn(),
    mockCheckApiRateLimit: vi.fn(),
  })
);

const mockPrisma = {
  campaign: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  emailJob: {
    updateMany: vi.fn(),
  },
  systemSetting: { findUnique: vi.fn().mockResolvedValue(null) },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  $disconnect: vi.fn(),
};

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
      throw new RateLimitError("You're doing that too frequently. Please wait a moment and try again.", 60);
    }
  }),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckApiRateLimit.mockResolvedValue(null);
  mockPrisma.campaign.updateMany.mockResolvedValue({ count: 1 });
});

describe('POST /api/campaigns/[id]/retry-failed', () => {
  const url = `http://localhost/api/campaigns/${CAMPAIGN_ID}/retry-failed`;

  it('resets all FAILED jobs and returns the count', async () => {
    authenticated();
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: CAMPAIGN_ID, status: 'COMPLETED', user_id: 'user-1' });
    mockPrisma.emailJob.updateMany.mockResolvedValue({ count: 3 });

    const response = await retryFailed(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('3 emails queued for retry.');
    expect(body.data).toEqual({ retriedCount: 3 });
    expect(mockPrisma.emailJob.updateMany).toHaveBeenCalledWith({
      where: { campaign_id: CAMPAIGN_ID, status: 'FAILED' },
      data: {
        status: 'SCHEDULED',
        attempt_count: 0,
        error_message: null,
        processing_started_at: null,
        next_attempt_at: null,
      },
    });
  });

  it('reopens a COMPLETED campaign back to ACTIVE', async () => {
    authenticated();
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: CAMPAIGN_ID, status: 'COMPLETED', user_id: 'user-1' });
    mockPrisma.emailJob.updateMany.mockResolvedValue({ count: 2 });

    await retryFailed(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });

    expect(mockPrisma.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: CAMPAIGN_ID, status: 'COMPLETED' },
      data: { status: 'ACTIVE' },
    });
  });

  it('does not change campaign status when it is already ACTIVE', async () => {
    authenticated();
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: CAMPAIGN_ID, status: 'ACTIVE', user_id: 'user-1' });
    mockPrisma.emailJob.updateMany.mockResolvedValue({ count: 1 });

    await retryFailed(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });

    expect(mockPrisma.campaign.updateMany).not.toHaveBeenCalled();
  });

  it('uses singular message for one failed email', async () => {
    authenticated();
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: CAMPAIGN_ID, status: 'ACTIVE', user_id: 'user-1' });
    mockPrisma.emailJob.updateMany.mockResolvedValue({ count: 1 });

    const response = await retryFailed(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(body.message).toBe('1 email queued for retry.');
  });

  it('returns 409 when there are no FAILED jobs to retry', async () => {
    authenticated();
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: CAMPAIGN_ID, status: 'COMPLETED', user_id: 'user-1' });
    mockPrisma.emailJob.updateMany.mockResolvedValue({ count: 0 });

    const response = await retryFailed(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('BUSINESS_ERROR');
    expect(body.error?.message).toBe('No failed emails to retry in this campaign.');
  });

  it('returns 404 when the campaign is not found', async () => {
    authenticated();
    mockPrisma.campaign.findUnique.mockResolvedValue(null);

    const response = await retryFailed(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('NOT_FOUND');
  });

  it('returns 409 when the campaign is CANCELLED', async () => {
    authenticated();
    mockPrisma.campaign.findUnique.mockResolvedValue({ id: CAMPAIGN_ID, status: 'CANCELLED', user_id: 'user-1' });

    const response = await retryFailed(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('BUSINESS_ERROR');
    expect(body.error?.message).toBe('Cannot retry emails from a cancelled campaign.');
  });

  it('returns 400 for a non-uuid id', async () => {
    authenticated();

    const response = await retryFailed(new NextRequest('http://localhost/api/campaigns/not-a-uuid/retry-failed', { method: 'POST' }), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await retryFailed(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await retryFailed(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('returns the rate-limit response when limited', async () => {
    authenticated();
    rateLimited();

    const response = await retryFailed(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });

    expect(response.status).toBe(429);
  });
});
