import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { NextRequest } from 'next/server';
import { AuthenticationError, ForbiddenError } from '@/lib/errors';
import { createMockPrisma } from '@/tests/mocks/helpers';
import { GET as listEmails } from '@/app/api/admin/emails/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  pagination?: { total: number; page: number; pageSize: number; totalPages: number };
  error?: { type: string; message: string };
}

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const JOB_ID = '99999999-9999-4999-8999-999999999999';

const { mockRequireAdmin } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
}));

const mockPrisma = createMockPrisma() as unknown as {
  emailJob: { findMany: Mock; count: Mock };
};

vi.mock('@/lib/auth/guards', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: vi.fn(),
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue(null),
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

function asNonAdmin(): void {
  mockRequireAdmin.mockRejectedValue(new ForbiddenError('Administrator access is required.'));
}

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/admin/emails${query}`);
}

function findManyArgs(call = 0): Record<string, unknown> {
  return mockPrisma.emailJob.findMany.mock.calls[call][0] as Record<string, unknown>;
}

beforeEach(() => {
  asAdmin();
  mockPrisma.emailJob.findMany.mockResolvedValue([
    {
      id: JOB_ID,
      to_email: 'lead@example.com',
      subject: 'Hello there',
      status: 'SENT',
      sent_at: new Date('2030-01-02T00:00:00.000Z'),
      error_message: null,
      created_at: new Date('2030-01-01T00:00:00.000Z'),
      user: { email: 'owner@example.com' },
    },
  ]);
  mockPrisma.emailJob.count.mockResolvedValue(1);
});

describe('GET /api/admin/emails', () => {
  it('returns the paginated job list with the admin projection', async () => {
    const response = await listEmails(request());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data).toEqual([
      expect.objectContaining({ id: JOB_ID, to_email: 'lead@example.com', status: 'SENT' }),
    ]);
    expect(body.pagination).toEqual({ total: 1, page: 1, pageSize: 20, totalPages: 1 });
    expect(response.headers.get('X-Request-ID')).toBeTruthy();

    const args = findManyArgs();
    expect(args.where).toEqual({});
    expect(args.skip).toBe(0);
    expect(args.take).toBe(20);
    expect(args.orderBy).toEqual({ created_at: 'desc' });
    expect(args.select).toEqual({
      id: true,
      to_email: true,
      subject: true,
      status: true,
      sent_at: true,
      error_message: true,
      created_at: true,
      user: { select: { email: true } },
    });
    expect(mockPrisma.emailJob.count).toHaveBeenCalledWith({ where: {} });
  });

  it('applies page and limit and reports totalPages', async () => {
    mockPrisma.emailJob.count.mockResolvedValue(45);

    const response = await listEmails(request('?page=3&limit=10'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.pagination).toEqual({ total: 45, page: 3, pageSize: 10, totalPages: 5 });
    expect(findManyArgs()).toMatchObject({ skip: 20, take: 10 });
  });

  it('reports at least one page when there are no results', async () => {
    mockPrisma.emailJob.findMany.mockResolvedValue([]);
    mockPrisma.emailJob.count.mockResolvedValue(0);

    const response = await listEmails(request());
    const body = (await response.json()) as ApiBody;

    expect(body.data).toEqual([]);
    expect(body.pagination).toEqual({ total: 0, page: 1, pageSize: 20, totalPages: 1 });
  });

  it('filters by a known email job status', async () => {
    await listEmails(request('?status=DELIVERY_UNKNOWN'));

    expect(findManyArgs().where).toEqual({ status: 'DELIVERY_UNKNOWN' });
  });

  it('ignores an unknown status value', async () => {
    await listEmails(request('?status=NOT_A_STATUS'));

    expect(findManyArgs().where).toEqual({});
  });

  it('applies a trimmed case-insensitive search on to_email', async () => {
    await listEmails(request('?search=%20lead%40example%20'));

    expect(findManyArgs().where).toEqual({
      to_email: { contains: 'lead@example', mode: 'insensitive' },
    });
  });

  it('ignores a whitespace-only search', async () => {
    await listEmails(request('?search=%20%20'));

    expect(findManyArgs().where).toEqual({});
  });

  it('combines the status filter and the search term', async () => {
    await listEmails(request('?status=FAILED&search=lead'));

    expect(findManyArgs().where).toEqual({
      status: 'FAILED',
      to_email: { contains: 'lead', mode: 'insensitive' },
    });
    expect(mockPrisma.emailJob.count).toHaveBeenCalledWith({
      where: { status: 'FAILED', to_email: { contains: 'lead', mode: 'insensitive' } },
    });
  });

  it('returns 403 AUTHORIZATION_ERROR for a non-admin caller', async () => {
    asNonAdmin();

    const response = await listEmails(request());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(mockPrisma.emailJob.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when there is no session', async () => {
    mockRequireAdmin.mockRejectedValue(new AuthenticationError('Please log in to continue.'));

    const response = await listEmails(request());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 500 when pagination input is not a valid number (zod throws, not a 400)', async () => {
    const response = await listEmails(request('?page=0'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
    expect(mockPrisma.emailJob.findMany).not.toHaveBeenCalled();
  });

  it('returns 500 when the query fails', async () => {
    mockPrisma.emailJob.findMany.mockRejectedValue(new Error('connection lost'));

    const response = await listEmails(request());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });

  it('returns 500 when the count query fails', async () => {
    mockPrisma.emailJob.count.mockRejectedValue(new Error('count failed'));

    const response = await listEmails(request());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});
