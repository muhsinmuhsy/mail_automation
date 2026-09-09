import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as previewTemplate } from '@/app/api/templates/[id]/preview/route';

interface ApiBody {
  success: boolean;
  data?: { html: string | null; text: string; subject: string };
  error?: { type: string; message: string };
}

const TEMPLATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONTACT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const { mockRequireVerifiedSession, mockCheckApiRateLimit } = vi.hoisted(() => ({
  mockRequireVerifiedSession: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
}));

const mockPrisma = {
  template: {
    findUnique: vi.fn().mockResolvedValue({ user_id: 'user-1' }),
    findFirst: vi.fn(),
  },
  contact: {
    findFirst: vi.fn(),
  },
  contactField: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  contactFieldValue: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  $disconnect: vi.fn(),
};

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: mockRequireVerifiedSession,
  getSession: vi.fn().mockImplementation(() => {
    throw new Error('Email verification required.');
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
  mockPrisma.template.findFirst.mockResolvedValue({
    id: TEMPLATE_ID,
    subject: 'Hi {{name}}',
    body_html: '<p>Hello {{first_name}}</p>',
    body_text: 'Hello {{first_name}}',
    body: 'Hello {{first_name}}',
  });
  mockPrisma.contact.findFirst.mockResolvedValue({
    id: CONTACT_ID,
    name: 'Jane Doe',
    email: 'jane@example.com',
  });
});

function jsonRequest(body: unknown, url: string): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/templates/[id]/preview', () => {
  const url = `http://localhost/api/templates/${TEMPLATE_ID}/preview`;

  it('returns resolved HTML, text, and subject with sample data', async () => {
    const response = await previewTemplate(jsonRequest({}, url), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.subject).toBe('Hi John Doe');
    expect(body.data?.html).toContain('Hello John');
    expect(body.data?.text).toContain('Hello John');
  });

  it('substitutes merge tags with a real contact when contactId is provided', async () => {
    const response = await previewTemplate(jsonRequest({ contactId: CONTACT_ID }, url), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.data?.subject).toBe('Hi Jane Doe');
    expect(body.data?.html).toContain('Hello Jane');
  });

  it('returns 404 when the template is not found', async () => {
    mockPrisma.template.findFirst.mockResolvedValue(null);

    const response = await previewTemplate(jsonRequest({}, url), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
  });

  it('returns 403 when the contact does not belong to the user', async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);

    const response = await previewTemplate(jsonRequest({ contactId: CONTACT_ID }, url), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns null html for legacy plain-text templates', async () => {
    mockPrisma.template.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      subject: 'Hi {{name}}',
      body_html: null,
      body_text: null,
      body: 'Hello {{name}}',
    });

    const response = await previewTemplate(jsonRequest({}, url), {
      params: Promise.resolve({ id: TEMPLATE_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.data?.html).toBeNull();
    expect(body.data?.text).toContain('Hello John Doe');
  });
});
