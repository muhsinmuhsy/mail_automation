import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/errors';
import { GET as listFields, POST as createField } from '@/app/api/contact-fields/route';
import {
  GET as getField,
  PATCH as patchField,
  DELETE as deleteField,
} from '@/app/api/contact-fields/[id]/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  pagination?: { total: number; page: number; pageSize: number; totalPages: number };
  error?: { type: string; message: string; fields?: Record<string, string> };
}

const FIELD_ID = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';

const { mockRequireVerifiedSession, mockCheckApiRateLimit } = vi.hoisted(() => ({
  mockRequireVerifiedSession: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
}));

const mockPrisma = {
  contactField: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  contactFieldValue: {
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
  },
  template: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  $transaction: vi.fn(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)),
  $disconnect: vi.fn(),
};

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: mockRequireVerifiedSession,
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

function jsonRequest(
  body: unknown,
  method = 'POST',
  url = 'http://localhost/api/contact-fields'
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
  mockPrisma.contactField.findMany.mockResolvedValue([
    {
      id: FIELD_ID,
      user_id: 'user-1',
      name: 'size',
      label: 'T-shirt Size',
      field_type: 'text',
      sort_order: 0,
      is_required: false,
      is_default: false,
      version: 0,
    },
  ]);
  mockPrisma.contactField.count.mockResolvedValue(1);
  mockPrisma.contactField.create.mockResolvedValue({
    id: FIELD_ID,
    user_id: 'user-1',
    name: 'size',
    label: 'T-shirt Size',
    field_type: 'text',
    sort_order: 0,
    is_required: false,
    is_default: false,
    version: 0,
  });
  mockPrisma.contactField.findFirst.mockResolvedValue({
    id: FIELD_ID,
    user_id: 'user-1',
    name: 'size',
    label: 'T-shirt Size',
    field_type: 'text',
    sort_order: 0,
    is_required: false,
    is_default: false,
    version: 0,
  });
  mockPrisma.contactField.update.mockResolvedValue({
    id: FIELD_ID,
    user_id: 'user-1',
    name: 'size',
    label: 'Shirt Size',
    field_type: 'text',
    sort_order: 0,
    is_required: false,
    is_default: false,
    version: 1,
  });
  mockPrisma.contactField.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.contactField.delete.mockResolvedValue({});
  mockPrisma.contactField.deleteMany.mockResolvedValue({ count: 1 });
});

describe('GET /api/contact-fields', () => {
  it('returns the paginated field list for the current user', async () => {
    const response = await listFields(new NextRequest('http://localhost/api/contact-fields'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(mockPrisma.contactField.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-1' },
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      })
    );
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await listFields(new NextRequest('http://localhost/api/contact-fields'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });
});

describe('POST /api/contact-fields', () => {
  const validBody = {
    name: 'size',
    label: 'T-shirt Size',
    field_type: 'text',
  };

  it('creates a field and returns 201', async () => {
    mockPrisma.contactField.count.mockResolvedValue(0);
    const response = await createField(jsonRequest(validBody));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockPrisma.contactField.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'user-1',
        name: 'size',
        label: 'T-shirt Size',
        field_type: 'text',
      }),
    });
  });

  it('returns 400 VALIDATION_ERROR for a reserved token', async () => {
    const response = await createField(jsonRequest({ name: 'name', label: 'Name' }));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.contactField.create).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR for an invalid token', async () => {
    const response = await createField(jsonRequest({ name: 'Size!', label: 'Size' }));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
  });

  it('returns 409 CONFLICT when the token already exists', async () => {
    mockPrisma.contactField.count.mockResolvedValue(0);
    mockPrisma.contactField.create.mockRejectedValue(
      Object.assign(new Error('dup'), { code: 'P2002' })
    );

    const response = await createField(jsonRequest(validBody));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.error?.type).toBe('CONFLICT');
    expect(body.error?.message).toBe('A field with this token already exists.');
  });

  it('returns 400 when the per-user field limit is exceeded', async () => {
    mockPrisma.contactField.count.mockResolvedValue(100);

    const response = await createField(jsonRequest(validBody));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.contactField.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/contact-fields/[id]', () => {
  const url = `http://localhost/api/contact-fields/${FIELD_ID}`;

  it('updates the field label and increments version', async () => {
    const response = await patchField(
      jsonRequest({ label: 'Shirt Size', version: 0 }, 'PATCH', url),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Field updated.');
  });

  it('returns 409 CONFLICT when the version is stale', async () => {
    mockPrisma.contactField.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.contactField.findFirst.mockResolvedValue({ version: 1 });

    const response = await patchField(
      jsonRequest({ label: 'Shirt Size', version: 0 }, 'PATCH', url),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.error?.type).toBe('CONFLICT');
  });

  it('returns 404 when the field is not owned by the user', async () => {
    mockPrisma.contactField.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.contactField.findFirst.mockResolvedValue(null);

    const response = await patchField(
      jsonRequest({ label: 'Shirt Size', version: 0 }, 'PATCH', url),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await patchField(
      jsonRequest({ label: 'Shirt Size', version: 0 }, 'PATCH', url),
      { params: Promise.resolve({ id: 'oops' }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /api/contact-fields/[id]', () => {
  const url = `http://localhost/api/contact-fields/${FIELD_ID}`;

  it('deletes the field and its values in a transaction', async () => {
    const response = await deleteField(
      new NextRequest(`${url}?version=0`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Field deleted.');
    expect(mockPrisma.contactFieldValue.deleteMany).toHaveBeenCalledWith({
      where: { field_id: FIELD_ID },
    });
    expect(mockPrisma.contactField.delete).toHaveBeenCalledWith({
      where: { id: FIELD_ID },
    });
  });

  it('returns 400 when version is missing', async () => {
    const response = await deleteField(
      new NextRequest(url, { method: 'DELETE' }),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
  });

  it('returns 409 CONFLICT when the version is stale', async () => {
    mockPrisma.contactField.findFirst.mockResolvedValue(null);
    // The transaction's second findFirst (the "any" check) returns a field with a different version.
    mockPrisma.contactField.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ version: 1 });

    const response = await deleteField(
      new NextRequest(`${url}?version=0`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.error?.type).toBe('CONFLICT');
  });
});

describe('GET /api/contact-fields/[id] (usage counts)', () => {
  const url = `http://localhost/api/contact-fields/${FIELD_ID}`;

  it('returns template_usage_count and contact_value_count', async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      { id: 't1', name: 'Welcome', subject: 'Hi {{name}}', body: 'Size: {{size}}' },
      { id: 't2', name: 'Newsletter', subject: 'Newsletter', body: 'No tokens here' },
    ]);
    mockPrisma.contactFieldValue.count.mockResolvedValue(5);

    const response = await getField(new NextRequest(url), {
      params: Promise.resolve({ id: FIELD_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    const data = body.data as {
      template_usage_count: number;
      contact_value_count: number;
      affected_template_names: string[];
    };
    expect(data.template_usage_count).toBe(1);
    expect(data.contact_value_count).toBe(5);
    expect(data.affected_template_names).toEqual(['Welcome']);
  });

  it('returns 404 when the field is not owned by the user', async () => {
    mockPrisma.contactField.findFirst.mockResolvedValue(null);

    const response = await getField(new NextRequest(url), {
      params: Promise.resolve({ id: FIELD_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
  });
});
