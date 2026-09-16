import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/errors';
import { GET as getField } from '@/app/api/contact-fields/[id]/route';

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
  systemSetting: { findUnique: vi.fn().mockResolvedValue(null) },
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

beforeEach(() => {
  authenticated();
  mockCheckApiRateLimit.mockResolvedValue(null);
  mockPrisma.contactField.findFirst.mockResolvedValue({
    id: FIELD_ID,
    user_id: 'user-1',
    name: 't_shirt_size',
    label: 'T-shirt size',
    field_type: 'text',
    sort_order: 0,
    is_required: false,
    is_default: false,
    version: 0,
  });
  mockPrisma.contactFieldValue.count.mockResolvedValue(0);
});

describe('GET /api/contact-fields/[id] — visual template usage scanning (§10.1)', () => {
  const url = `http://localhost/api/contact-fields/${FIELD_ID}`;

  it('detects templates that use the field only in body_html', async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Visual welcome',
        subject: 'Hi {{name}}',
        body: '',
        body_text: '',
        body_html: '<p>T-shirt size: {{t_shirt_size}}</p>',
      },
      {
        id: 't2',
        name: 'Plain newsletter',
        subject: 'Newsletter',
        body: 'No tokens here',
        body_text: 'No tokens here',
        body_html: '<p>No tokens here</p>',
      },
    ]);

    const response = await getField(new NextRequest(url), {
      params: Promise.resolve({ id: FIELD_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as {
      template_usage_count: number;
      affected_template_names: string[];
    };
    expect(data.template_usage_count).toBe(1);
    expect(data.affected_template_names).toEqual(['Visual welcome']);
  });

  it('detects templates that use the field only in body_text', async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Text-only template',
        subject: 'Hi',
        body: '',
        body_text: 'Size: {{t_shirt_size}}',
        body_html: null,
      },
    ]);

    const response = await getField(new NextRequest(url), {
      params: Promise.resolve({ id: FIELD_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { template_usage_count: number; affected_template_names: string[] };
    expect(data.template_usage_count).toBe(1);
    expect(data.affected_template_names).toEqual(['Text-only template']);
  });

  it('detects templates that use the field in body (legacy)', async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Legacy template',
        subject: 'Hi',
        body: 'Size: {{t_shirt_size}}',
        body_text: null,
        body_html: null,
      },
    ]);

    const response = await getField(new NextRequest(url), {
      params: Promise.resolve({ id: FIELD_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { template_usage_count: number };
    expect(data.template_usage_count).toBe(1);
  });

  it('detects templates that use the field in subject', async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Subject token template',
        subject: 'Size {{t_shirt_size}} announcement',
        body: '',
        body_text: '',
        body_html: '',
      },
    ]);

    const response = await getField(new NextRequest(url), {
      params: Promise.resolve({ id: FIELD_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { template_usage_count: number };
    expect(data.template_usage_count).toBe(1);
  });

  it('detects a template using the field across multiple columns without double-counting', async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Multi-column template',
        subject: '{{t_shirt_size}} sale',
        body: 'Size: {{t_shirt_size}}',
        body_text: 'Your size: {{t_shirt_size}}',
        body_html: '<p>Size: {{t_shirt_size}}</p>',
      },
    ]);

    const response = await getField(new NextRequest(url), {
      params: Promise.resolve({ id: FIELD_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { template_usage_count: number; affected_template_names: string[] };
    expect(data.template_usage_count).toBe(1);
    expect(data.affected_template_names).toEqual(['Multi-column template']);
  });

  it('returns 0 affected templates when the field is not referenced anywhere', async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Unrelated template',
        subject: 'Hi {{name}}',
        body: 'Welcome',
        body_text: 'Welcome',
        body_html: '<p>Welcome</p>',
      },
    ]);

    const response = await getField(new NextRequest(url), {
      params: Promise.resolve({ id: FIELD_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { template_usage_count: number; affected_template_names: string[] };
    expect(data.template_usage_count).toBe(0);
    expect(data.affected_template_names).toEqual([]);
  });

  it('handles null body_html and body_text columns without throwing', async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Legacy with nulls',
        subject: 'Hi',
        body: 'No tokens',
        body_text: null,
        body_html: null,
      },
    ]);

    const response = await getField(new NextRequest(url), {
      params: Promise.resolve({ id: FIELD_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { template_usage_count: number };
    expect(data.template_usage_count).toBe(0);
  });

  it('aggregates affected template names across visual and legacy templates', async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'Visual',
        subject: 'Hi',
        body: '',
        body_text: '',
        body_html: '<p>{{t_shirt_size}}</p>',
      },
      {
        id: 't2',
        name: 'Legacy',
        subject: 'Hi',
        body: '{{t_shirt_size}}',
        body_text: null,
        body_html: null,
      },
      {
        id: 't3',
        name: 'Unrelated',
        subject: 'Hi',
        body: 'No tokens',
        body_text: 'No tokens',
        body_html: '<p>No tokens</p>',
      },
    ]);

    const response = await getField(new NextRequest(url), {
      params: Promise.resolve({ id: FIELD_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    const data = body.data as { template_usage_count: number; affected_template_names: string[] };
    expect(data.template_usage_count).toBe(2);
    expect(data.affected_template_names).toEqual(['Visual', 'Legacy']);
  });

  it('selects body, body_html, and body_text columns from template.findMany', async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      {
        id: 't1',
        name: 'T',
        subject: 'Hi',
        body: '',
        body_text: '',
        body_html: '',
      },
    ]);

    await getField(new NextRequest(url), {
      params: Promise.resolve({ id: FIELD_ID }),
    });

    expect(mockPrisma.template.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        body: true,
        body_html: true,
        body_text: true,
      }),
    }));
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
