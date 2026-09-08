import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/errors';
import { POST as createField } from '@/app/api/contact-fields/route';
import {
  PATCH as patchField,
  DELETE as deleteField,
} from '@/app/api/contact-fields/[id]/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: { type: string; message: string; fields?: Record<string, string> };
}

const FIELD_ID = 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1';

const { mockRequireVerifiedSession, mockCheckApiRateLimit } = vi.hoisted(() => ({
  mockRequireVerifiedSession: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
}));

const mockPrisma = {
  contactField: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
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
    update: vi.fn(),
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
  mockRequireVerifiedSession.mockResolvedValue({
    session: { user: { id: 'user-1', email: 'user@example.com', emailVerified: true } },
  });
  mockCheckApiRateLimit.mockResolvedValue(null);
  mockPrisma.contactField.count.mockResolvedValue(0);
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
  mockPrisma.contactField.findUniqueOrThrow.mockResolvedValue({
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
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma)
  );
});

describe('concurrency: same-token race (P2002)', () => {
  it('returns 409 CONFLICT when two concurrent creates collide on unique constraint', async () => {
    mockPrisma.contactField.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    );

    const response = await createField(jsonRequest({ name: 'size', label: 'Size', field_type: 'text' }));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.error?.type).toBe('CONFLICT');
    expect(body.error?.message).toBe('A field with this token already exists.');
  });
});

describe('concurrency: version conflict on PATCH (no type change)', () => {
  const url = `http://localhost/api/contact-fields/${FIELD_ID}`;

  it('returns 409 when updateMany affects 0 rows due to stale version', async () => {
    mockPrisma.contactField.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.contactField.findFirst.mockResolvedValue({ version: 2 });

    const response = await patchField(
      jsonRequest({ label: 'Updated', version: 0 }, 'PATCH', url),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.error?.type).toBe('CONFLICT');
    expect(body.error?.message).toContain('modified by another request');
  });

  it('returns 404 when the field was deleted (findFirst returns null)', async () => {
    mockPrisma.contactField.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.contactField.findFirst.mockResolvedValue(null);

    const response = await patchField(
      jsonRequest({ label: 'Updated', version: 0 }, 'PATCH', url),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
  });
});

describe('concurrency: version conflict on PATCH (type change)', () => {
  const url = `http://localhost/api/contact-fields/${FIELD_ID}`;

  it('returns 409 when the version is stale inside the transaction', async () => {
    mockPrisma.contactField.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ version: 3 });

    const response = await patchField(
      jsonRequest({ label: 'Number Field', field_type: 'number', version: 0 }, 'PATCH', url),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.error?.type).toBe('CONFLICT');
  });

  it('returns 404 when the field was deleted before the type change', async () => {
    mockPrisma.contactField.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const response = await patchField(
      jsonRequest({ label: 'Number Field', field_type: 'number', version: 0 }, 'PATCH', url),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
  });
});

describe('concurrency: version conflict on DELETE', () => {
  const url = `http://localhost/api/contact-fields/${FIELD_ID}`;

  it('returns 409 when the version is stale', async () => {
    mockPrisma.contactField.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ version: 5 });

    const response = await deleteField(
      new NextRequest(`${url}?version=0`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(409);
    expect(body.error?.type).toBe('CONFLICT');
    expect(body.error?.message).toContain('modified by another request');
  });

  it('returns 404 when the field was already deleted', async () => {
    mockPrisma.contactField.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const response = await deleteField(
      new NextRequest(`${url}?version=0`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
  });
});

describe('concurrency: P2034 serialization failure', () => {
  const url = `http://localhost/api/contact-fields/${FIELD_ID}`;

  it('propagates P2034 as a database error when transaction fails', async () => {
    mockPrisma.$transaction.mockRejectedValue(
      Object.assign(new Error('Transaction could not be serialized'), { code: 'P2034' })
    );

    const response = await patchField(
      jsonRequest({ label: 'Number', field_type: 'number', version: 0 }, 'PATCH', url),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('DATABASE_ERROR');
  });

  it('propagates P2034 on DELETE as a database error', async () => {
    mockPrisma.$transaction.mockRejectedValue(
      Object.assign(new Error('Transaction could not be serialized'), { code: 'P2034' })
    );

    const response = await deleteField(
      new NextRequest(`${url}?version=0`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('DATABASE_ERROR');
  });
});

describe('concurrency: delete-during-type-change', () => {
  const url = `http://localhost/api/contact-fields/${FIELD_ID}`;

  it('returns 409 (not a silent no-op) when field is deleted between read and update', async () => {
    mockPrisma.contactField.findFirst
      .mockResolvedValueOnce({
        id: FIELD_ID,
        field_type: 'text',
        version: 0,
      })
      .mockResolvedValueOnce({ version: 0 });
    mockPrisma.contactField.update.mockRejectedValue(
      Object.assign(new Error('Record not found'), { code: 'P2025' })
    );

    const response = await patchField(
      jsonRequest({ label: 'Number', field_type: 'number', version: 0 }, 'PATCH', url),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
  });
});
