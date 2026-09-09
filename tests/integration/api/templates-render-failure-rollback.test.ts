/**
 * Transactional save test (§7.1).
 *
 * If renderTemplate() throws (invalid TemplateContent, mjml error), POST/PATCH
 * must return an error and the DB must remain unchanged — no body_json saved
 * with null body_mjml/body_html/body_text.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

interface ApiBody {
  success: boolean;
  data?: unknown;
  error?: { type: string; message: string };
}

const TEMPLATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const { mockRequireVerifiedSession, mockCheckApiRateLimit, mockRenderTemplate } = vi.hoisted(() => ({
  mockRequireVerifiedSession: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
  mockRenderTemplate: vi.fn(),
}));

vi.mock('@/lib/email/render', () => ({
  renderTemplate: mockRenderTemplate,
}));

const mockPrisma = {
  template: {
    findUnique: vi.fn().mockResolvedValue({ user_id: 'user-1' }),
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
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
  mockRenderTemplate.mockReset();
  mockPrisma.template.create.mockReset();
  mockPrisma.template.updateMany.mockReset();
});

function jsonRequest(body: unknown, method = 'POST', url = 'http://localhost/api/templates'): NextRequest {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/templates — render failure rollback (§7.1)', () => {
  it('does not write to the DB when renderTemplate throws on POST', async () => {
    mockRenderTemplate.mockRejectedValue(new Error('MJML compilation failed: bad block'));

    const { POST: createTemplate } = await import('@/app/api/templates/route');
    const response = await createTemplate(
      jsonRequest({ name: 'Broken', subject: 'Hi', bodyJson: '{"blocks":[],"settings":{}}' })
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(mockPrisma.template.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/templates/[id] — render failure rollback (§7.1)', () => {
  const url = `http://localhost/api/templates/${TEMPLATE_ID}`;

  it('does not write to the DB when renderTemplate throws on PATCH', async () => {
    mockRenderTemplate.mockRejectedValue(new Error('Invalid template content.'));

    const { PATCH: patchTemplate } = await import('@/app/api/templates/[id]/route');
    const response = await patchTemplate(
      jsonRequest({ bodyJson: '{"blocks":[],"settings":{}}' }, 'PATCH', url),
      { params: Promise.resolve({ id: TEMPLATE_ID }) }
    );
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(mockPrisma.template.updateMany).not.toHaveBeenCalled();
  });
});
