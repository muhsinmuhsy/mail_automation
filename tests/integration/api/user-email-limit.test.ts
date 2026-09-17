import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getEmailLimit } from '@/app/api/user/email-limit/route';

interface ApiBody {
  success: boolean;
  data?: {
    dailyEmailLimit: number;
    sentToday: number;
    reservedToday: number;
    remaining: number;
  };
  error?: { type: string; message: string };
}

const { mockRequireVerifiedSession, mockCheckApiRateLimit } = vi.hoisted(() => ({
  mockRequireVerifiedSession: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
}));

const mockPrisma = {
  emailUsageDaily: { findUnique: vi.fn() },
  systemSetting: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), upsert: vi.fn().mockResolvedValue({ id: 'user-1' }) },
  campaign: { findUnique: vi.fn() },
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
      throw new RateLimitError('Too frequent.', 60);
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
    error: { type: 'AUTHENTICATION_ERROR', message: 'Please log in.' },
  });
}

describe('GET /api/user/email-limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckApiRateLimit.mockResolvedValue(false);
  });

  it('returns limit and usage for the authenticated user', async () => {
    authenticated();
    mockPrisma.emailUsageDaily.findUnique.mockResolvedValue({ sent_count: 15, reserved_count: 3 });
    mockPrisma.systemSetting.findUnique.mockResolvedValue({ global_daily_email_limit: 500 });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.campaign.findUnique.mockResolvedValue(null);

    const response = await getEmailLimit(new NextRequest('http://localhost/api/user/email-limit'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      dailyEmailLimit: 500,
      sentToday: 15,
      reservedToday: 3,
      remaining: 482,
    });
  });

  it('returns zeros when no usage recorded', async () => {
    authenticated();
    mockPrisma.emailUsageDaily.findUnique.mockResolvedValue(null);
    mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.campaign.findUnique.mockResolvedValue(null);

    const response = await getEmailLimit(new NextRequest('http://localhost/api/user/email-limit'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      dailyEmailLimit: 20,
      sentToday: 0,
      reservedToday: 0,
      remaining: 20,
    });
  });

  it('respects user override over global limit', async () => {
    authenticated();
    mockPrisma.emailUsageDaily.findUnique.mockResolvedValue({ sent_count: 5, reserved_count: 0 });
    mockPrisma.systemSetting.findUnique.mockResolvedValue({ global_daily_email_limit: 500 });
    mockPrisma.user.findUnique.mockResolvedValue({ daily_email_limit_override: 50 });
    mockPrisma.campaign.findUnique.mockResolvedValue(null);

    const response = await getEmailLimit(new NextRequest('http://localhost/api/user/email-limit'));
    const body = (await response.json()) as ApiBody;

    expect(body.data?.dailyEmailLimit).toBe(50);
    expect(body.data?.remaining).toBe(45);
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await getEmailLimit(new NextRequest('http://localhost/api/user/email-limit'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });
});
