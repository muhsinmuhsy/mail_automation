import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST as retryEmail } from '@/app/api/emails/[id]/retry/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: { type: string; message: string; fields?: Record<string, string>; retryAfter?: number };
}

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN_ID = '22222222-2222-4222-8222-222222222222';

const { mockRequireVerifiedSession, mockCheckApiRateLimit } = vi.hoisted(
  () => ({
    mockRequireVerifiedSession: vi.fn(),
    mockCheckApiRateLimit: vi.fn(),
  })
);

const mockPrisma = {
  emailJob: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  campaign: {
    findUnique: vi.fn(),
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
  mockPrisma.emailJob.update.mockResolvedValue({ id: JOB_ID });
  mockPrisma.campaign.updateMany.mockResolvedValue({ count: 1 });
});

describe('POST /api/emails/[id]/retry', () => {
  const url = `http://localhost/api/emails/${JOB_ID}/retry`;

  it('resets a FAILED job to SCHEDULED and returns confirmation', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: JOB_ID, status: 'FAILED', campaign_id: CAMPAIGN_ID, user_id: 'user-1',
    });
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'COMPLETED' });

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Email queued for retry.');
    expect(mockPrisma.emailJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: {
        status: 'SCHEDULED',
        attempt_count: 0,
        error_message: null,
        processing_started_at: null,
        next_attempt_at: null,
      },
    });
  });

  it('does not change campaign status when already ACTIVE', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: JOB_ID, status: 'FAILED', campaign_id: CAMPAIGN_ID, user_id: 'user-1',
    });
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'ACTIVE' });

    await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });

    expect(mockPrisma.campaign.updateMany).not.toHaveBeenCalled();
  });

  it('reopens a COMPLETED campaign back to ACTIVE', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: JOB_ID, status: 'FAILED', campaign_id: CAMPAIGN_ID, user_id: 'user-1',
    });
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'COMPLETED' });

    await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });

    expect(mockPrisma.campaign.updateMany).toHaveBeenCalledWith({
      where: { id: CAMPAIGN_ID, status: 'COMPLETED' },
      data: { status: 'ACTIVE' },
    });
  });

  it('handles jobs without a campaign (campaign_id null)', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: JOB_ID, status: 'FAILED', campaign_id: null, user_id: 'user-1',
    });

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.campaign.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.campaign.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the job is not found', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue(null);

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('NOT_FOUND');
  });

  it('returns 409 when the job is not FAILED or RETRY_WAIT', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: JOB_ID, status: 'SENT', campaign_id: CAMPAIGN_ID, user_id: 'user-1',
    });

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('BUSINESS_ERROR');
    expect(body.error?.message).toBe('Only failed or waiting emails can be retried.');
  });

  it('allows retry even when error_message says legacy "Daily email limit reached" — consumer re-checks actual limit', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: JOB_ID, status: 'RETRY_WAIT', campaign_id: CAMPAIGN_ID, user_id: 'user-1',
      error_message: 'Daily email limit reached.',
    });
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'ACTIVE' });

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.emailJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: {
        status: 'SCHEDULED',
        attempt_count: 0,
        error_message: null,
        processing_started_at: null,
        next_attempt_at: null,
      },
    });
  });

  it('allows retry when error has SYSTEM_DAILY_LIMIT code — consumer re-checks actual limit', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: JOB_ID, status: 'RETRY_WAIT', campaign_id: CAMPAIGN_ID, user_id: 'user-1',
      error_message: '[SYSTEM_DAILY_LIMIT] System daily limit reached (500 of 500). Try again tomorrow.',
    });
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'ACTIVE' });

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.emailJob.update).toHaveBeenCalled();
  });

  it('allows retry when error has ACCOUNT_DAILY_LIMIT code — consumer re-checks actual limit', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: JOB_ID, status: 'RETRY_WAIT', campaign_id: CAMPAIGN_ID, user_id: 'user-1',
      error_message: '[ACCOUNT_DAILY_LIMIT] Account daily limit reached (20 of 20). Resets at midnight UTC.',
    });
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'ACTIVE' });

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.emailJob.update).toHaveBeenCalled();
  });

  it('allows retry when error has CAMPAIGN_DAILY_LIMIT code — consumer re-checks actual limit', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: JOB_ID, status: 'RETRY_WAIT', campaign_id: CAMPAIGN_ID, user_id: 'user-1',
      error_message: '[CAMPAIGN_DAILY_LIMIT] Campaign daily limit reached (2 of 2). Resets at midnight UTC.',
    });
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'ACTIVE' });

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.emailJob.update).toHaveBeenCalled();
  });

  it('clears error_message and resets attempt_count on retry from RETRY_WAIT with limit error', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: JOB_ID, status: 'RETRY_WAIT', campaign_id: null, user_id: 'user-1',
      error_message: '[ACCOUNT_DAILY_LIMIT] Account daily limit reached (20 of 20). Resets at midnight UTC.',
    });

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.emailJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: {
        status: 'SCHEDULED',
        attempt_count: 0,
        error_message: null,
        processing_started_at: null,
        next_attempt_at: null,
      },
    });
  });

  it('allows retry when the error is QUOTA_TRANSACTION_CONFLICT (transient)', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: JOB_ID, status: 'RETRY_WAIT', campaign_id: CAMPAIGN_ID, user_id: 'user-1',
      error_message: '[QUOTA_TRANSACTION_CONFLICT] Could not reserve email capacity after 3 attempts.',
    });
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'ACTIVE' });

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.emailJob.update).toHaveBeenCalled();
  });

  it('returns 409 when the campaign is CANCELLED', async () => {
    authenticated();
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: JOB_ID, status: 'FAILED', campaign_id: CAMPAIGN_ID, user_id: 'user-1',
    });
    mockPrisma.campaign.findUnique.mockResolvedValue({ status: 'CANCELLED' });

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('BUSINESS_ERROR');
    expect(body.error?.message).toBe('Cannot retry an email from a cancelled campaign.');
  });

  it('returns 400 for a non-uuid id', async () => {
    authenticated();

    const response = await retryEmail(new NextRequest('http://localhost/api/emails/not-a-uuid/retry', { method: 'POST' }), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
  });

  it('returns the rate-limit response when limited', async () => {
    authenticated();
    rateLimited();

    const response = await retryEmail(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: JOB_ID }),
    });

    expect(response.status).toBe(429);
  });
});
