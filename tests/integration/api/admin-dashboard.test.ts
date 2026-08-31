import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { NextRequest } from 'next/server';
import { AuthenticationError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { createMockPrisma } from '@/tests/mocks/helpers';
import { GET as getDashboard } from '@/app/api/admin/dashboard/route';

interface ApiBody {
  success: boolean;
  data?: { totalUsers?: number; settings?: unknown };
  error?: { type: string; message: string };
}

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));

const mockPrisma = createMockPrisma() as unknown as {
  user: { count: Mock };
  systemSetting: { findUnique: Mock };
};

vi.mock('@/lib/auth/guards', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

const SETTINGS = {
  id: 1,
  default_daily_email_limit: 50,
  global_daily_email_limit: 5000,
  email_sending_enabled: true,
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

function request(): NextRequest {
  return new NextRequest('http://localhost/api/admin/dashboard');
}

beforeEach(() => {
  asAdmin();
  mockPrisma.user.count.mockResolvedValue(7);
  mockPrisma.systemSetting.findUnique.mockResolvedValue(SETTINGS);
});

describe('GET /api/admin/dashboard', () => {
  it('returns the user count and the system settings', async () => {
    const response = await getDashboard(request());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Object.keys(body.data ?? {}).sort()).toEqual(['settings', 'totalUsers']);
    expect(body.data?.totalUsers).toBe(7);
    expect(body.data?.settings).toMatchObject({
      id: 1,
      default_daily_email_limit: 50,
      global_daily_email_limit: 5000,
      email_sending_enabled: true,
    });
    expect(response.headers.get('X-Request-ID')).toBeTruthy();
    expect(mockPrisma.user.count).toHaveBeenCalledWith();
    expect(mockPrisma.systemSetting.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('reports zero users and null settings on a fresh install', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.systemSetting.findUnique.mockResolvedValue(null);

    const response = await getDashboard(request());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ totalUsers: 0, settings: null });
  });

  it('returns 403 AUTHORIZATION_ERROR for a non-admin caller', async () => {
    asNonAdmin();

    const response = await getDashboard(request());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(mockPrisma.user.count).not.toHaveBeenCalled();
    expect(mockPrisma.systemSetting.findUnique).not.toHaveBeenCalled();
  });

  it('returns 401 when there is no session', async () => {
    mockRequireAdmin.mockRejectedValue(new AuthenticationError('Please log in to continue.'));

    const response = await getDashboard(request());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 404 when the guard cannot find the admin user record', async () => {
    mockRequireAdmin.mockRejectedValue(new NotFoundError('User record not found.'));

    const response = await getDashboard(request());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
  });

  it('returns 500 when counting users fails', async () => {
    mockPrisma.user.count.mockRejectedValue(new Error('connection lost'));

    const response = await getDashboard(request());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
    expect(mockPrisma.systemSetting.findUnique).not.toHaveBeenCalled();
  });

  it('returns 500 when loading the settings fails', async () => {
    mockPrisma.systemSetting.findUnique.mockRejectedValue(new Error('settings unavailable'));

    const response = await getDashboard(request());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});
