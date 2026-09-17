import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { AuthenticationError, ForbiddenError } from '@/lib/errors';
import { createMockPrisma } from '@/tests/mocks/helpers';
import { GET as getSettings, PATCH as patchSettings } from '@/app/api/admin/settings/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: { type: string; message: string; fields?: Record<string, string>; retryAfter?: number };
}

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';

const { mockRequireAdmin, mockCheckApiRateLimit } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
}));

const mockPrisma = createMockPrisma() as unknown as {
  systemSetting: { upsert: Mock; findUnique: Mock };
  systemUsageDaily: { findUnique: Mock };
};

vi.mock('@/lib/auth/guards', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: vi.fn(),
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

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

const STORED_SETTINGS = {
  id: 1,
  default_daily_email_limit: 50,
  global_daily_email_limit: 5000,
  email_sending_enabled: true,
  updated_at: new Date('2030-01-01T00:00:00.000Z'),
};

function asAdmin(): void {
  mockRequireAdmin.mockResolvedValue({
    sessionUser: { id: ADMIN_ID, email: 'admin@example.com', emailVerified: true },
    role: 'ADMIN',
  });
}

function asNonAdmin(): void {
  mockRequireAdmin.mockRejectedValue(new ForbiddenError('Administrator access is required.'));
}

function rateLimited(): void {
  mockCheckApiRateLimit.mockResolvedValue(
    NextResponse.json(
      {
        success: false,
        error: {
          type: 'RATE_LIMITED',
          message: "You're doing that too frequently. Please wait a moment and try again.",
          retryAfter: 60,
        },
      },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  );
}

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/settings');
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/settings', {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    default_daily_email_limit: 75,
    global_daily_email_limit: 7500,
    email_sending_enabled: false,
    ...overrides,
  };
}

beforeEach(() => {
  asAdmin();
  mockCheckApiRateLimit.mockResolvedValue(null);
  mockPrisma.systemSetting.upsert.mockResolvedValue(STORED_SETTINGS);
});

describe('GET /api/admin/settings', () => {
  it('returns the singleton settings row', async () => {
    const response = await getSettings(getRequest());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: 1,
      default_daily_email_limit: 50,
      global_daily_email_limit: 5000,
      email_sending_enabled: true,
    });
    expect(response.headers.get('X-Request-ID')).toBeTruthy();
    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        default_daily_email_limit: 20,
        global_daily_email_limit: 500,
        email_sending_enabled: true,
      },
    });
  });

  it('includes usageToday with system daily usage', async () => {
    mockPrisma.systemUsageDaily.findUnique.mockResolvedValue({ sent_count: 300, reserved_count: 25 });
    mockPrisma.systemSetting.findUnique.mockResolvedValue({ global_daily_email_limit: 5000 });

    const response = await getSettings(getRequest());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      usageToday: { sent: 300, reserved: 25, limit: 5000 },
    });
  });

  it('returns 403 AUTHORIZATION_ERROR for a non-admin caller', async () => {
    asNonAdmin();

    const response = await getSettings(getRequest());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(mockPrisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it('returns 401 when there is no session', async () => {
    mockRequireAdmin.mockRejectedValue(new AuthenticationError('Please log in to continue.'));

    const response = await getSettings(getRequest());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 500 when the read fails', async () => {
    mockPrisma.systemSetting.upsert.mockRejectedValue(new Error('connection lost'));

    const response = await getSettings(getRequest());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('PATCH /api/admin/settings', () => {
  it('updates the global limits and the sending kill switch', async () => {
    mockPrisma.systemSetting.upsert.mockImplementation(
      async ({ update }: { update: Record<string, unknown> }) => ({ ...STORED_SETTINGS, ...update })
    );

    const response = await patchSettings(patchRequest(validBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Settings updated.');
    expect(body.data).toMatchObject({
      default_daily_email_limit: 75,
      global_daily_email_limit: 7500,
      email_sending_enabled: false,
    });
    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: {
        default_daily_email_limit: 75,
        global_daily_email_limit: 7500,
        email_sending_enabled: false,
      },
      create: {
        id: 1,
        default_daily_email_limit: 75,
        global_daily_email_limit: 7500,
        email_sending_enabled: false,
      },
    });
    expect(mockCheckApiRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_ID,
      'admin-settings'
    );
  });

  it('coerces numeric strings for both limits', async () => {
    const response = await patchSettings(
      patchRequest({
        default_daily_email_limit: '120',
        global_daily_email_limit: '12000',
        email_sending_enabled: true,
      })
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: {
        default_daily_email_limit: 120,
        global_daily_email_limit: 12000,
        email_sending_enabled: true,
      },
      create: {
        id: 1,
        default_daily_email_limit: 120,
        global_daily_email_limit: 12000,
        email_sending_enabled: true,
      },
    });
  });

  it('returns 400 VALIDATION_ERROR when a field is missing', async () => {
    const response = await patchSettings(
      patchRequest({ default_daily_email_limit: 10, global_daily_email_limit: 100 })
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toBe('Please correct the highlighted fields.');
    expect(mockPrisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for non-positive or non-integer limits', async () => {
    const response = await patchSettings(
      patchRequest({
        default_daily_email_limit: 0,
        global_daily_email_limit: 1.5,
        email_sending_enabled: 'yes',
      })
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    // The route passes the field map as `details` rather than `{ fields }`, so
    // the error handler never surfaces it as `error.fields`.
    expect(body.error?.fields).toBeUndefined();
    expect(mockPrisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it('returns 500 when the body is not valid JSON', async () => {
    const response = await patchSettings(patchRequest('{not-json'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
    expect(mockPrisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it('returns the limiter response when rate limited', async () => {
    rateLimited();

    const response = await patchSettings(patchRequest(validBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(429);
    expect(body.error?.type).toBe('RATE_LIMITED');
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mockPrisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin caller and never touches the limiter', async () => {
    asNonAdmin();

    const response = await patchSettings(patchRequest(validBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(mockCheckApiRateLimit).not.toHaveBeenCalled();
  });

  it('returns 500 when the update fails', async () => {
    mockPrisma.systemSetting.upsert.mockRejectedValue(new Error('write failed'));

    const response = await patchSettings(patchRequest(validBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });

  it('returns 500 (not 404) when the settings row is missing, since P2025 is not mapped', async () => {
    mockPrisma.systemSetting.upsert.mockRejectedValue(
      Object.assign(new Error('An operation failed because it depends on one or more records'), {
        code: 'P2025',
      })
    );

    const response = await patchSettings(patchRequest(validBody()));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});
