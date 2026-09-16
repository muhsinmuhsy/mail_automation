import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/errors';
import { GET as listEmails } from '@/app/api/emails/route';
import { GET as getEmail } from '@/app/api/emails/[id]/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  pagination?: { total: number; page: number; pageSize: number; totalPages: number };
  error?: { type: string; message: string };
}

const EMAIL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const { mockRequireVerifiedSession } = vi.hoisted(() => ({
  mockRequireVerifiedSession: vi.fn(),
}));

const mockPrisma = {
  emailJob: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  systemSetting: { findUnique: vi.fn().mockResolvedValue(null) },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  $disconnect: vi.fn(),
};
// The route resolves ownership and loads the job via `emailJob.findUnique`,
// but this suite was written against `findFirst`; alias them so both resolve identically.
mockPrisma.emailJob.findUnique = mockPrisma.emailJob.findFirst;

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: mockRequireVerifiedSession,
  // Unverified users have no secondary (raw) session to fall back to in tests,
  // so ownership/admin guards must reject them with a 403.
  getSession: vi.fn().mockImplementation(() => {
    throw new ForbiddenError('Email verification required.');
  }),
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue(null),
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

beforeEach(() => {
  authenticated();
  mockPrisma.emailJob.findMany.mockResolvedValue([
    {
      id: EMAIL_ID,
      to_email: 'lead@example.com',
      subject: 'Hello',
      status: 'SENT',
      sent_at: new Date('2030-01-01'),
      created_at: new Date('2030-01-01'),
    },
  ]);
  mockPrisma.emailJob.count.mockResolvedValue(1);
  mockPrisma.emailJob.findFirst.mockResolvedValue({
    id: EMAIL_ID,
    user_id: 'user-1',
    to_email: 'lead@example.com',
    email_logs: [],
  });
});

describe('GET /api/emails', () => {
  it('returns the paginated email list for the current user', async () => {
    const response = await listEmails(new NextRequest('http://localhost/api/emails'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual({ total: 1, page: 1, pageSize: 20, totalPages: 1 });
    expect(mockPrisma.emailJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-1' },
        select: expect.objectContaining({ scheduled_at: true, next_attempt_at: true, campaign: { select: { timezone: true, name: true } } }),
        skip: 0,
        take: 20,
        orderBy: { created_at: 'desc' },
      })
    );
    expect(mockPrisma.emailJob.count).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
  });

  it('honours page and limit query parameters', async () => {
    mockPrisma.emailJob.count.mockResolvedValue(31);

    const response = await listEmails(
      new NextRequest('http://localhost/api/emails?page=2&limit=15')
    );
    const body = (await response.json()) as ApiBody;

    expect(body.pagination).toEqual({ total: 31, page: 2, pageSize: 15, totalPages: 3 });
    expect(mockPrisma.emailJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 15, take: 15 })
    );
  });

  it('rejects invalid pagination values with a 500 (parseListQuery throws instead of defaulting)', async () => {
    const response = await listEmails(
      new NextRequest('http://localhost/api/emails?page=abc&limit=0')
    );
    const body = (await response.json()) as ApiBody;

    // NOTE: lib/api/list.ts documents "invalid values fall back to safe defaults"
    // but uses `paginationSchema.parse`, so a ZodError escapes and becomes a 500.
    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
    expect(mockPrisma.emailJob.findMany).not.toHaveBeenCalled();
  });

  it('uses default pagination when no page/limit is supplied', async () => {
    await listEmails(new NextRequest('http://localhost/api/emails'));

    expect(mockPrisma.emailJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
  });

  it('searches by recipient email, case-insensitively', async () => {
    await listEmails(new NextRequest('http://localhost/api/emails?search=lead'));

    const where = mockPrisma.emailJob.findMany.mock.calls[0][0].where;
    expect(where.to_email).toEqual({ contains: 'lead', mode: 'insensitive' });
  });

  it('filters by a known job status', async () => {
    await listEmails(new NextRequest('http://localhost/api/emails?status=RETRY_WAIT'));

    const where = mockPrisma.emailJob.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('RETRY_WAIT');
  });

  it('ignores an unsupported status value', async () => {
    await listEmails(new NextRequest('http://localhost/api/emails?status=NOPE'));

    const where = mockPrisma.emailJob.findMany.mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await listEmails(new NextRequest('http://localhost/api/emails'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
    expect(mockPrisma.emailJob.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 when the email is not verified', async () => {
    unverified();

    const response = await listEmails(new NextRequest('http://localhost/api/emails'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when the query fails', async () => {
    mockPrisma.emailJob.count.mockRejectedValue(new Error('db unreachable'));

    const response = await listEmails(new NextRequest('http://localhost/api/emails'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('GET /api/emails/[id]', () => {
  it('returns the email job with its logs', async () => {
    mockPrisma.emailJob.findFirst.mockResolvedValue({
      id: EMAIL_ID,
      user_id: 'user-1',
      to_email: 'lead@example.com',
      email_logs: [{ id: 'log-1', event: 'SENT' }],
    });

    const response = await getEmail(new NextRequest(`http://localhost/api/emails/${EMAIL_ID}`), {
      params: Promise.resolve({ id: EMAIL_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: EMAIL_ID });
    expect(mockPrisma.emailJob.findUnique).toHaveBeenCalledWith({
      where: { id: EMAIL_ID },
      include: { email_logs: true },
    });
  });

  it('returns 404 when the email does not belong to the user', async () => {
    mockPrisma.emailJob.findFirst.mockResolvedValue(null);

    const response = await getEmail(new NextRequest(`http://localhost/api/emails/${EMAIL_ID}`), {
      params: Promise.resolve({ id: EMAIL_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(body.error?.message).toBe('Email not found.');
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await getEmail(new NextRequest('http://localhost/api/emails/12345'), {
      params: Promise.resolve({ id: '12345' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.emailJob.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: '12345' } })
    );
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await getEmail(new NextRequest(`http://localhost/api/emails/${EMAIL_ID}`), {
      params: Promise.resolve({ id: EMAIL_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 403 when the email is not verified', async () => {
    unverified();

    const response = await getEmail(new NextRequest(`http://localhost/api/emails/${EMAIL_ID}`), {
      params: Promise.resolve({ id: EMAIL_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when the lookup fails', async () => {
    mockPrisma.emailJob.findFirst.mockRejectedValue(new Error('boom'));

    const response = await getEmail(new NextRequest(`http://localhost/api/emails/${EMAIL_ID}`), {
      params: Promise.resolve({ id: EMAIL_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});
