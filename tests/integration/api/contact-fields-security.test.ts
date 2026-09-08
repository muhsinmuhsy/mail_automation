import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/errors';
import { GET as listFields, POST as createField } from '@/app/api/contact-fields/route';
import {
  PATCH as patchField,
  DELETE as deleteField,
} from '@/app/api/contact-fields/[id]/route';

/**
 * Cross-user authorization tests (§11.10).
 * User A cannot read/modify/delete User B's fields.
 */

const FIELD_ID = 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2';

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
      throw new RateLimitError('Too fast.', 60);
    }
  }),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

beforeEach(() => {
  mockRequireVerifiedSession.mockResolvedValue({
    session: { user: { id: 'user-1', email: 'user@example.com', emailVerified: true } },
  });
  mockCheckApiRateLimit.mockResolvedValue(null);
  // Simulate "field not found for this user" — findFirst returns null because
  // the field belongs to another user and the where clause includes user_id.
  mockPrisma.contactField.findFirst.mockResolvedValue(null);
  mockPrisma.contactField.updateMany.mockResolvedValue({ count: 0 });
});

function jsonRequest(body: unknown, method = 'POST', url = 'http://localhost/api/contact-fields'): NextRequest {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('cross-user authorization (§11.10)', () => {
  it('GET /api/contact-fields scopes by user_id', async () => {
    await listFields(new NextRequest('http://localhost/api/contact-fields'));
    const where = mockPrisma.contactField.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ user_id: 'user-1' });
  });

  it('POST /api/contact-fields sets user_id from ctx', async () => {
    mockPrisma.contactField.create.mockResolvedValue({ id: FIELD_ID });
    await createField(jsonRequest({ name: 'size', label: 'Size' }));
    const data = mockPrisma.contactField.create.mock.calls[0][0].data;
    expect(data.user_id).toBe('user-1');
  });

  it('PATCH /api/contact-fields/[id] returns 404 for another user\'s field', async () => {
    const url = `http://localhost/api/contact-fields/${FIELD_ID}`;
    const response = await patchField(
      jsonRequest({ label: 'Updated', version: 0 }, 'PATCH', url),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = await response.json() as { error?: { type?: string } };
    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
  });

  it('DELETE /api/contact-fields/[id] returns 404 for another user\'s field', async () => {
    const url = `http://localhost/api/contact-fields/${FIELD_ID}?version=0`;
    const response = await deleteField(
      new NextRequest(url, { method: 'DELETE' }),
      { params: Promise.resolve({ id: FIELD_ID }) }
    );
    const body = await response.json() as { error?: { type?: string } };
    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
  });
});
