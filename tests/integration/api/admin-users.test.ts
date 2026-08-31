import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { AuthenticationError, ForbiddenError } from '@/lib/errors';
import { createMockPrisma } from '@/tests/mocks/helpers';
import { GET as listUsers } from '@/app/api/admin/users/route';
import { GET as getUser, PATCH as patchUser } from '@/app/api/admin/users/[id]/route';
import { POST as disableUser } from '@/app/api/admin/users/[id]/disable/route';
import { POST as enableUser } from '@/app/api/admin/users/[id]/enable/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: { type: string; message: string; fields?: Record<string, string>; retryAfter?: number };
}

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '11111111-1111-4111-8111-111111111111';

const { mockRequireAdmin, mockCheckApiRateLimit } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
}));

const mockPrisma = createMockPrisma() as unknown as {
  user: { findMany: Mock; findUnique: Mock; update: Mock };
};

vi.mock('@/lib/auth/guards', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: mockCheckApiRateLimit,
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

function asAdmin(): void {
  mockRequireAdmin.mockResolvedValue({
    sessionUser: { id: ADMIN_ID, email: 'admin@example.com', emailVerified: true },
    role: 'ADMIN',
  });
}

/** requireAdmin throws ForbiddenError (code FORBIDDEN -> type AUTHORIZATION_ERROR, 403). */
function asNonAdmin(): void {
  mockRequireAdmin.mockRejectedValue(new ForbiddenError('Administrator access is required.'));
}

function asAnonymous(): void {
  mockRequireAdmin.mockRejectedValue(new AuthenticationError('Please log in to continue.'));
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

function targetUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: USER_ID,
    email: 'user@example.com',
    name: 'Regular User',
    role: 'USER',
    is_active: true,
    daily_email_limit_override: 250,
    created_at: new Date('2030-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function patchRequest(body: unknown, id = USER_ID): NextRequest {
  return new NextRequest(`http://localhost/api/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function actionRequest(action: string, id = USER_ID): NextRequest {
  return new NextRequest(`http://localhost/api/admin/users/${id}/${action}`, { method: 'POST' });
}

beforeEach(() => {
  asAdmin();
  mockCheckApiRateLimit.mockResolvedValue(null);

  mockPrisma.user.findMany.mockResolvedValue([targetUser()]);
  mockPrisma.user.findUnique.mockResolvedValue(targetUser());
  mockPrisma.user.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...targetUser(),
    ...data,
  }));
});

describe('GET /api/admin/users', () => {
  it('returns every user with the admin projection', async () => {
    const response = await listUsers(new NextRequest('http://localhost/api/admin/users'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data).toEqual([
      expect.objectContaining({ id: USER_ID, email: 'user@example.com', role: 'USER' }),
    ]);
    expect(response.headers.get('X-Request-ID')).toBeTruthy();
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        is_active: true,
        daily_email_limit_override: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  });

  it('returns an empty array when there are no users', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    const response = await listUsers(new NextRequest('http://localhost/api/admin/users'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it('returns 403 AUTHORIZATION_ERROR for a non-admin caller', async () => {
    asNonAdmin();

    const response = await listUsers(new NextRequest('http://localhost/api/admin/users'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 AUTHENTICATION_ERROR when there is no session', async () => {
    asAnonymous();

    const response = await listUsers(new NextRequest('http://localhost/api/admin/users'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });

  it('maps a non-AppError guard failure to a generic 500', async () => {
    mockRequireAdmin.mockRejectedValue(new Error('guard exploded'));

    const response = await listUsers(new NextRequest('http://localhost/api/admin/users'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
    expect(body.error?.message).toBe('An unexpected error occurred.');
  });

  it('returns 500 when the query fails', async () => {
    mockPrisma.user.findMany.mockRejectedValue(new Error('connection lost'));

    const response = await listUsers(new NextRequest('http://localhost/api/admin/users'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('GET /api/admin/users/[id]', () => {
  it('returns the requested user', async () => {
    const response = await getUser(
      new NextRequest(`http://localhost/api/admin/users/${USER_ID}`),
      { params: Promise.resolve({ id: USER_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: USER_ID, email: 'user@example.com' });
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } })
    );
  });

  it('returns 404 when the user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await getUser(
      new NextRequest(`http://localhost/api/admin/users/${USER_ID}`),
      { params: Promise.resolve({ id: USER_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(body.error?.message).toBe('User not found.');
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await getUser(new NextRequest('http://localhost/api/admin/users/nope'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toBe('Invalid ID.');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin caller', async () => {
    asNonAdmin();

    const response = await getUser(
      new NextRequest(`http://localhost/api/admin/users/${USER_ID}`),
      { params: Promise.resolve({ id: USER_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when the lookup fails', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('db down'));

    const response = await getUser(
      new NextRequest(`http://localhost/api/admin/users/${USER_ID}`),
      { params: Promise.resolve({ id: USER_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('PATCH /api/admin/users/[id]', () => {
  it('updates is_active and daily_email_limit_override', async () => {
    const response = await patchUser(
      patchRequest({ is_active: false, daily_email_limit_override: 40 }),
      { params: Promise.resolve({ id: USER_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('User updated.');
    expect(body.data).toMatchObject({ is_active: false, daily_email_limit_override: 40 });
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { is_active: false, daily_email_limit_override: 40 },
      })
    );
    expect(mockCheckApiRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_ID,
      'admin-user-update'
    );
  });

  it('coerces a numeric string limit override', async () => {
    const response = await patchUser(patchRequest({ daily_email_limit_override: '300' }), {
      params: Promise.resolve({ id: USER_ID }),
    });

    expect(response.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { is_active: true, daily_email_limit_override: 300 } })
    );
  });

  it('keeps the stored values when the body is empty', async () => {
    const response = await patchUser(patchRequest({}), {
      params: Promise.resolve({ id: USER_ID }),
    });

    expect(response.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { is_active: true, daily_email_limit_override: 250 } })
    );
  });

  it('ignores a role change because the route never persists role (documented behaviour)', async () => {
    const response = await patchUser(patchRequest({ role: 'ADMIN' }), {
      params: Promise.resolve({ id: USER_ID }),
    });

    expect(response.status).toBe(200);
    const data = mockPrisma.user.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('role');
  });

  it('cannot clear the limit override with null because of the ?? fallback (documented behaviour)', async () => {
    const response = await patchUser(patchRequest({ daily_email_limit_override: null }), {
      params: Promise.resolve({ id: USER_ID }),
    });

    expect(response.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { is_active: true, daily_email_limit_override: 250 } })
    );
  });

  it('refuses to deactivate the calling admin account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      targetUser({ id: ADMIN_ID, role: 'ADMIN', email: 'admin@example.com' })
    );

    const response = await patchUser(patchRequest({ is_active: false }, ADMIN_ID), {
      params: Promise.resolve({ id: ADMIN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(body.error?.message).toBe('Cannot disable the last active admin.');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('still allows the calling admin to update other fields', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      targetUser({ id: ADMIN_ID, role: 'ADMIN', email: 'admin@example.com' })
    );

    const response = await patchUser(
      patchRequest({ daily_email_limit_override: 999 }, ADMIN_ID),
      { params: Promise.resolve({ id: ADMIN_ID }) }
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalled();
  });

  it('allows deactivating a different admin account', async () => {
    const otherAdmin = '22222222-2222-4222-8222-222222222222';
    mockPrisma.user.findUnique.mockResolvedValue(
      targetUser({ id: otherAdmin, role: 'ADMIN', email: 'other-admin@example.com' })
    );

    const response = await patchUser(patchRequest({ is_active: false }, otherAdmin), {
      params: Promise.resolve({ id: otherAdmin }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.message).toBe('User updated.');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: otherAdmin },
        data: { is_active: false, daily_email_limit_override: 250 },
      })
    );
  });

  it('returns 404 when the target user is missing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await patchUser(patchRequest({ is_active: true }), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-uuid id before reading the body', async () => {
    const response = await patchUser(patchRequest({ is_active: true }, 'not-a-uuid'), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toBe('Invalid ID.');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for an invalid body', async () => {
    const response = await patchUser(
      patchRequest({ is_active: 'yes', daily_email_limit_override: -5, role: 'SUPERUSER' }),
      { params: Promise.resolve({ id: USER_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toBe('Please correct the highlighted fields.');
    // The route passes the field map as `details` (not `{ fields }`), so the
    // error handler never surfaces it as `error.fields`.
    expect(body.error?.fields).toBeUndefined();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 500 when the body is not valid JSON', async () => {
    const request = new NextRequest(`http://localhost/api/admin/users/${USER_ID}`, {
      method: 'PATCH',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await patchUser(request, { params: Promise.resolve({ id: USER_ID }) });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });

  it('returns the limiter response when rate limited', async () => {
    rateLimited();

    const response = await patchUser(patchRequest({ is_active: true }), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(429);
    expect(body.error?.type).toBe('RATE_LIMITED');
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin caller and never touches the limiter', async () => {
    asNonAdmin();

    const response = await patchUser(patchRequest({ is_active: true }), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(mockCheckApiRateLimit).not.toHaveBeenCalled();
  });

  it('returns 500 when the update fails', async () => {
    mockPrisma.user.update.mockRejectedValue(new Error('write failed'));

    const response = await patchUser(patchRequest({ is_active: true }), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('POST /api/admin/users/[id]/disable', () => {
  it('deactivates the target user', async () => {
    const response = await disableUser(actionRequest('disable'), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
    expect(body.message).toBe('User disabled.');
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { is_active: false },
    });
    expect(mockCheckApiRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_ID,
      'admin-user-disable'
    );
  });

  it('refuses to disable the calling admin account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(targetUser({ id: ADMIN_ID, role: 'ADMIN' }));

    const response = await disableUser(actionRequest('disable', ADMIN_ID), {
      params: Promise.resolve({ id: ADMIN_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(body.error?.message).toBe('Cannot disable your own admin account.');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('disables another admin account', async () => {
    const otherAdmin = '22222222-2222-4222-8222-222222222222';
    mockPrisma.user.findUnique.mockResolvedValue(targetUser({ id: otherAdmin, role: 'ADMIN' }));

    const response = await disableUser(actionRequest('disable', otherAdmin), {
      params: Promise.resolve({ id: otherAdmin }),
    });

    expect(response.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: otherAdmin },
      data: { is_active: false },
    });
  });

  it('returns 404 when the user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await disableUser(actionRequest('disable'), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await disableUser(actionRequest('disable', 'abc'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns the limiter response when rate limited', async () => {
    rateLimited();

    const response = await disableUser(actionRequest('disable'), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(429);
    expect(body.error?.type).toBe('RATE_LIMITED');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin caller', async () => {
    asNonAdmin();

    const response = await disableUser(actionRequest('disable'), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when the update fails', async () => {
    mockPrisma.user.update.mockRejectedValue(new Error('db down'));

    const response = await disableUser(actionRequest('disable'), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('POST /api/admin/users/[id]/enable', () => {
  it('reactivates the target user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(targetUser({ is_active: false }));

    const response = await enableUser(actionRequest('enable'), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
    expect(body.message).toBe('User enabled.');
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { is_active: true },
    });
    expect(mockCheckApiRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN_ID,
      'admin-user-enable'
    );
  });

  it('returns 404 when the user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await enableUser(actionRequest('enable'), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await enableUser(actionRequest('enable', '123'), {
      params: Promise.resolve({ id: '123' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns the limiter response when rate limited', async () => {
    rateLimited();

    const response = await enableUser(actionRequest('enable'), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(429);
    expect(body.error?.type).toBe('RATE_LIMITED');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin caller', async () => {
    asNonAdmin();

    const response = await enableUser(actionRequest('enable'), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when the update fails', async () => {
    mockPrisma.user.update.mockRejectedValue(new Error('db down'));

    const response = await enableUser(actionRequest('enable'), {
      params: Promise.resolve({ id: USER_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});
