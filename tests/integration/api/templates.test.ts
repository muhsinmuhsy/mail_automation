import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET as listTemplates, POST as createTemplate } from '@/app/api/templates/route';
import { PATCH as patchTemplate, DELETE as deleteTemplate } from '@/app/api/templates/[id]/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  pagination?: { total: number; page: number; pageSize: number; totalPages: number };
  error?: { type: string; message: string; fields?: Record<string, string> };
}

const TEMPLATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const { mockRequireVerifiedSession, mockCheckApiRateLimit } = vi.hoisted(() => ({
  mockRequireVerifiedSession: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
}));

const mockPrisma = {
  template: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  $disconnect: vi.fn(),
};

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: mockRequireVerifiedSession,
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: mockCheckApiRateLimit,
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
  url = 'http://localhost/api/templates'
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
  mockPrisma.template.findMany.mockResolvedValue([
    { id: TEMPLATE_ID, name: 'Intro', subject: 'Hi {{name}}', created_at: new Date('2030-01-01') },
  ]);
  mockPrisma.template.count.mockResolvedValue(1);
  mockPrisma.template.create.mockResolvedValue({
    id: TEMPLATE_ID,
    name: 'Intro',
    subject: 'Hi {{name}}',
    created_at: new Date('2030-01-01'),
  });
  mockPrisma.template.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.template.deleteMany.mockResolvedValue({ count: 1 });
});

describe('GET /api/templates', () => {
  it('returns the paginated template list for the current user', async () => {
    const response = await listTemplates(new NextRequest('http://localhost/api/templates'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual({ total: 1, page: 1, pageSize: 20, totalPages: 1 });
    expect(mockPrisma.template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'user-1' }, skip: 0, take: 20 })
    );
  });

  it('applies pagination and name search', async () => {
    mockPrisma.template.count.mockResolvedValue(9);

    const response = await listTemplates(
      new NextRequest('http://localhost/api/templates?page=2&limit=4&search=intro')
    );
    const body = (await response.json()) as ApiBody;

    expect(body.pagination).toEqual({ total: 9, page: 2, pageSize: 4, totalPages: 3 });
    const where = mockPrisma.template.findMany.mock.calls[0][0].where;
    expect(where.name).toEqual({ contains: 'intro', mode: 'insensitive' });
    expect(mockPrisma.template.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 4, take: 4 })
    );
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await listTemplates(new NextRequest('http://localhost/api/templates'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await listTemplates(new NextRequest('http://localhost/api/templates'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when listing fails', async () => {
    mockPrisma.template.findMany.mockRejectedValue(new Error('db down'));

    const response = await listTemplates(new NextRequest('http://localhost/api/templates'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('POST /api/templates', () => {
  it('creates a template and returns 201', async () => {
    const response = await createTemplate(
      jsonRequest({ name: 'Intro', subject: 'Hi {{name}}', body: 'Hello {{name}}' })
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Template created successfully.');
    expect(mockPrisma.template.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        name: 'Intro',
        subject: 'Hi {{name}}',
        body: 'Hello {{name}}',
      },
      select: { id: true, name: true, subject: true, created_at: true },
    });
  });

  it('returns 400 VALIDATION_ERROR when required fields are missing', async () => {
    const response = await createTemplate(jsonRequest({ name: '', subject: '' }));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toBe('Please correct the highlighted fields.');
    expect(mockPrisma.template.create).not.toHaveBeenCalled();
  });

  it('returns 409 CONFLICT on a unique-constraint violation', async () => {
    mockPrisma.template.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));

    const response = await createTemplate(
      jsonRequest({ name: 'Intro', subject: 'Hi', body: 'Hello' })
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.error?.type).toBe('CONFLICT');
    expect(body.error?.message).toBe('This template already exists.');
  });

  it('maps other prisma failures to a database error', async () => {
    mockPrisma.template.create.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'P2003' })
    );

    const response = await createTemplate(
      jsonRequest({ name: 'Intro', subject: 'Hi', body: 'Hello' })
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('DATABASE_ERROR');
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await createTemplate(
      jsonRequest({ name: 'Intro', subject: 'Hi', body: 'Hello' })
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(429);
    expect(body.error?.type).toBe('RATE_LIMITED');
    expect(mockPrisma.template.create).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await createTemplate(
      jsonRequest({ name: 'Intro', subject: 'Hi', body: 'Hello' })
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
    expect(mockCheckApiRateLimit).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/templates/[id]', () => {
  const url = `http://localhost/api/templates/${TEMPLATE_ID}`;

  it('updates the template and returns a confirmation', async () => {
    const response = await patchTemplate(jsonRequest({ name: 'Renamed' }, 'PATCH', url), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Template updated.');
    expect(mockPrisma.template.updateMany).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID, user_id: 'user-1' },
      data: { name: 'Renamed' },
    });
  });

  it('returns 404 when nothing was updated', async () => {
    mockPrisma.template.updateMany.mockResolvedValue({ count: 0 });

    const response = await patchTemplate(jsonRequest({ subject: 'New subject' }, 'PATCH', url), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(body.error?.message).toBe('Template not found.');
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await patchTemplate(jsonRequest({ name: 'Renamed' }, 'PATCH', url), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.template.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 when the update payload is invalid', async () => {
    const response = await patchTemplate(jsonRequest({ name: '' }, 'PATCH', url), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Please correct the highlighted fields.');
    expect(mockPrisma.template.updateMany).not.toHaveBeenCalled();
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await patchTemplate(jsonRequest({ name: 'Renamed' }, 'PATCH', url), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });

    expect(response.status).toBe(429);
    expect(mockPrisma.template.updateMany).not.toHaveBeenCalled();
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await patchTemplate(jsonRequest({ name: 'Renamed' }, 'PATCH', url), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when the body is not valid JSON', async () => {
    const request = new NextRequest(url, {
      method: 'PATCH',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await patchTemplate(request, { params: Promise.resolve({ id: TEMPLATE_ID }) });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('DELETE /api/templates/[id]', () => {
  const url = `http://localhost/api/templates/${TEMPLATE_ID}`;

  it('deletes the template scoped to the user', async () => {
    const response = await deleteTemplate(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Template deleted.');
    expect(mockPrisma.template.deleteMany).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID, user_id: 'user-1' },
    });
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await deleteTemplate(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: '42' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.template.deleteMany).not.toHaveBeenCalled();
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await deleteTemplate(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });

    expect(response.status).toBe(429);
    expect(mockPrisma.template.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await deleteTemplate(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 500 when the delete fails', async () => {
    mockPrisma.template.deleteMany.mockRejectedValue(new Error('db down'));

    const response = await deleteTemplate(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});
