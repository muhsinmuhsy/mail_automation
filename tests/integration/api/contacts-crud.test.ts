import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { ForbiddenError } from '@/lib/errors';
import { GET as listContacts, POST as createContact } from '@/app/api/contacts/route';
import { PATCH as patchContact, DELETE as deleteContact } from '@/app/api/contacts/[id]/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  pagination?: { total: number; page: number; pageSize: number; totalPages: number };
  error?: { type: string; message: string; fields?: Record<string, string> };
}

const CONTACT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const { mockRequireVerifiedSession, mockCheckApiRateLimit } = vi.hoisted(() => ({
  mockRequireVerifiedSession: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
}));

const mockPrisma = {
  contact: {
    findMany: vi.fn(),
    findUnique: vi.fn().mockResolvedValue({ user_id: 'user-1' }),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
  },
  $disconnect: vi.fn(),
};

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: mockRequireVerifiedSession,
  // Unverified users have no secondary (raw) session to fall back to in tests,
  // so ownership/admin guards must reject them with a 403.
  getSession: vi.fn().mockImplementation(() => {
    throw new ForbiddenError('Email verification required.');
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

function jsonRequest(
  body: unknown,
  method = 'POST',
  url = 'http://localhost/api/contacts'
): NextRequest {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  authenticated();
  mockCheckApiRateLimit.mockResolvedValue(null);
  mockPrisma.contact.findMany.mockResolvedValue([
    {
      id: CONTACT_ID,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      company: 'Analytical Engines',
      job_title: 'Engineer',
    },
  ]);
  mockPrisma.contact.count.mockResolvedValue(1);
  mockPrisma.contact.create.mockResolvedValue({
    id: CONTACT_ID,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    company: 'Analytical Engines',
    job_title: 'Engineer',
  });
  mockPrisma.contact.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.contact.deleteMany.mockResolvedValue({ count: 1 });
});

describe('GET /api/contacts', () => {
  it('returns the paginated contact list for the current user', async () => {
    const response = await listContacts(new NextRequest('http://localhost/api/contacts'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual({ total: 1, page: 1, pageSize: 20, totalPages: 1 });
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-1' },
        skip: 0,
        take: 20,
        orderBy: { created_at: 'desc' },
      })
    );
  });

  it('searches across name and email and paginates', async () => {
    mockPrisma.contact.count.mockResolvedValue(12);

    const response = await listContacts(
      new NextRequest('http://localhost/api/contacts?search=ada&page=2&limit=5')
    );
    const body = (await response.json()) as ApiBody;

    expect(body.pagination).toEqual({ total: 12, page: 2, pageSize: 5, totalPages: 3 });
    const where = mockPrisma.contact.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { name: { contains: 'ada', mode: 'insensitive' } },
      { email: { contains: 'ada', mode: 'insensitive' } },
    ]);
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 })
    );
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await listContacts(new NextRequest('http://localhost/api/contacts'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
    expect(mockPrisma.contact.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await listContacts(new NextRequest('http://localhost/api/contacts'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when the query fails', async () => {
    mockPrisma.contact.findMany.mockRejectedValue(new Error('db down'));

    const response = await listContacts(new NextRequest('http://localhost/api/contacts'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('POST /api/contacts', () => {
  const validBody = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    company: 'Analytical Engines',
    job_title: 'Engineer',
    notes: 'Met at a conference',
  };

  it('creates a contact and returns 201', async () => {
    const response = await createContact(jsonRequest(validBody));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Contact added successfully.');
    expect(mockPrisma.contact.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        company: 'Analytical Engines',
        job_title: 'Engineer',
        notes: 'Met at a conference',
      },
      select: { id: true, name: true, email: true, company: true, job_title: true },
    });
  });

  it('returns 400 VALIDATION_ERROR for an invalid email', async () => {
    const response = await createContact(jsonRequest({ name: 'Ada', email: 'not-an-email' }));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toBe('Please correct the highlighted fields.');
    expect(mockPrisma.contact.create).not.toHaveBeenCalled();
  });

  it('returns 409 CONFLICT when the contact already exists', async () => {
    mockPrisma.contact.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));

    const response = await createContact(jsonRequest(validBody));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.error?.type).toBe('CONFLICT');
    expect(body.error?.message).toBe('This contact already exists.');
  });

  it('maps unknown prisma errors to a database error', async () => {
    mockPrisma.contact.create.mockRejectedValue(Object.assign(new Error('x'), { code: 'P2010' }));

    const response = await createContact(jsonRequest(validBody));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('DATABASE_ERROR');
  });

  it('maps a missing record error to 404', async () => {
    mockPrisma.contact.create.mockRejectedValue(Object.assign(new Error('gone'), { code: 'P2025' }));

    const response = await createContact(jsonRequest(validBody));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await createContact(jsonRequest(validBody));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(429);
    expect(body.error?.type).toBe('RATE_LIMITED');
    expect(mockPrisma.contact.create).not.toHaveBeenCalled();
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await createContact(jsonRequest(validBody));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(mockCheckApiRateLimit).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/contacts/[id]', () => {
  const url = `http://localhost/api/contacts/${CONTACT_ID}`;

  it('updates the contact and returns a confirmation', async () => {
    const response = await patchContact(
      jsonRequest({ name: 'Ada L.', company: null }, 'PATCH', url),
      { params: Promise.resolve({ id: CONTACT_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Contact updated.');
    expect(mockPrisma.contact.updateMany).toHaveBeenCalledWith({
      where: { id: CONTACT_ID, user_id: 'user-1' },
      data: { name: 'Ada L.', company: null },
    });
  });

  it('returns 404 when the contact is not owned by the user', async () => {
    mockPrisma.contact.updateMany.mockResolvedValue({ count: 0 });

    const response = await patchContact(jsonRequest({ name: 'Ada L.' }, 'PATCH', url), {
      params: Promise.resolve({ id: CONTACT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(body.error?.message).toBe('Contact not found.');
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await patchContact(jsonRequest({ name: 'Ada L.' }, 'PATCH', url), {
      params: Promise.resolve({ id: 'oops' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.contact.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 when the payload is invalid', async () => {
    const response = await patchContact(jsonRequest({ email: 'bad-email' }, 'PATCH', url), {
      params: Promise.resolve({ id: CONTACT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Please correct the highlighted fields.');
    expect(mockPrisma.contact.updateMany).not.toHaveBeenCalled();
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await patchContact(jsonRequest({ name: 'Ada L.' }, 'PATCH', url), {
      params: Promise.resolve({ id: CONTACT_ID }),
    });

    expect(response.status).toBe(429);
    expect(mockPrisma.contact.updateMany).not.toHaveBeenCalled();
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await patchContact(jsonRequest({ name: 'Ada L.' }, 'PATCH', url), {
      params: Promise.resolve({ id: CONTACT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when the update fails', async () => {
    mockPrisma.contact.updateMany.mockRejectedValue(new Error('db down'));

    const response = await patchContact(jsonRequest({ name: 'Ada L.' }, 'PATCH', url), {
      params: Promise.resolve({ id: CONTACT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('DELETE /api/contacts/[id]', () => {
  const url = `http://localhost/api/contacts/${CONTACT_ID}`;

  it('deletes the contact scoped to the user', async () => {
    const response = await deleteContact(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: CONTACT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Contact deleted.');
    expect(mockPrisma.contact.deleteMany).toHaveBeenCalledWith({
      where: { id: CONTACT_ID, user_id: 'user-1' },
    });
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await deleteContact(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'nope' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.contact.deleteMany).not.toHaveBeenCalled();
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await deleteContact(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: CONTACT_ID }),
    });

    expect(response.status).toBe(429);
    expect(mockPrisma.contact.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await deleteContact(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: CONTACT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 500 when the delete fails', async () => {
    mockPrisma.contact.deleteMany.mockRejectedValue(new Error('db down'));

    const response = await deleteContact(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: CONTACT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});
