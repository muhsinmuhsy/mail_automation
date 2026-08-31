import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { AuthenticationError, ForbiddenError } from '@/lib/errors';
import { createMockPrisma } from '@/tests/mocks/helpers';
import { GET as listCampaigns } from '@/app/api/admin/campaigns/route';
import { POST as cancelCampaign } from '@/app/api/admin/campaigns/[id]/cancel/route';
import { POST as pauseCampaign } from '@/app/api/admin/campaigns/[id]/pause/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  pagination?: { total: number; page: number; pageSize: number; totalPages: number };
  error?: { type: string; message: string; retryAfter?: number };
}

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';

const { mockRequireAdmin, mockCheckApiRateLimit } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
}));

const mockPrisma = createMockPrisma() as unknown as {
  campaign: { findMany: Mock; count: Mock; findUnique: Mock; update: Mock };
};

vi.mock('@/lib/auth/guards', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: mockCheckApiRateLimit,
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

function rateLimited(): void {
  mockCheckApiRateLimit.mockResolvedValue(
    NextResponse.json(
      {
        success: false,
        error: {
          type: 'RATE_LIMITED',
          message: "You're doing that too frequently. Please wait a moment and try again.",
          retryAfter: 60,
        },
      },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  );
}

function listRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/admin/campaigns${query}`);
}

function findManyArgs(call = 0): Record<string, unknown> {
  return mockPrisma.campaign.findMany.mock.calls[call][0] as Record<string, unknown>;
}

beforeEach(() => {
  asAdmin();
  mockCheckApiRateLimit.mockResolvedValue(null);

  mockPrisma.campaign.findMany.mockResolvedValue([
    {
      id: CAMPAIGN_ID,
      name: 'Spring outreach',
      status: 'ACTIVE',
      created_at: new Date('2030-01-01T00:00:00.000Z'),
      user: { email: 'owner@example.com' },
    },
  ]);
  mockPrisma.campaign.count.mockResolvedValue(1);
  mockPrisma.campaign.findUnique.mockResolvedValue({
    id: CAMPAIGN_ID,
    name: 'Spring outreach',
    status: 'ACTIVE',
    user_id: 'user-1',
  });
  mockPrisma.campaign.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: where.id,
      name: 'Spring outreach',
      ...data,
    })
  );
});

describe('GET /api/admin/campaigns', () => {
  it('returns the paginated campaign list with owner emails', async () => {
    const response = await listCampaigns(listRequest());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data).toEqual([
      expect.objectContaining({
        id: CAMPAIGN_ID,
        name: 'Spring outreach',
        status: 'ACTIVE',
        user: { email: 'owner@example.com' },
      }),
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
      name: true,
      status: true,
      created_at: true,
      user: { select: { email: true } },
    });
    expect(mockPrisma.campaign.count).toHaveBeenCalledWith({ where: {} });
  });

  it('applies page and limit and reports totalPages', async () => {
    mockPrisma.campaign.count.mockResolvedValue(31);

    const response = await listCampaigns(listRequest('?page=2&limit=15'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.pagination).toEqual({ total: 31, page: 2, pageSize: 15, totalPages: 3 });
    expect(findManyArgs()).toMatchObject({ skip: 15, take: 15 });
  });

  it('returns an empty page when there are no campaigns', async () => {
    mockPrisma.campaign.findMany.mockResolvedValue([]);
    mockPrisma.campaign.count.mockResolvedValue(0);

    const response = await listCampaigns(listRequest());
    const body = (await response.json()) as ApiBody;

    expect(body.data).toEqual([]);
    expect(body.pagination).toEqual({ total: 0, page: 1, pageSize: 20, totalPages: 1 });
  });

  it('filters by a known campaign status', async () => {
    await listCampaigns(listRequest('?status=CANCELLED'));

    expect(findManyArgs().where).toEqual({ status: 'CANCELLED' });
  });

  it('ignores an unknown status value', async () => {
    await listCampaigns(listRequest('?status=ARCHIVED'));

    expect(findManyArgs().where).toEqual({});
  });

  it('applies a trimmed case-insensitive name search', async () => {
    await listCampaigns(listRequest('?search=%20spring%20'));

    expect(findManyArgs().where).toEqual({ name: { contains: 'spring', mode: 'insensitive' } });
  });

  it('ignores a whitespace-only search', async () => {
    await listCampaigns(listRequest('?search=%20'));

    expect(findManyArgs().where).toEqual({});
  });

  it('combines the status filter and the search term', async () => {
    await listCampaigns(listRequest('?status=PAUSED&search=outreach'));

    expect(findManyArgs().where).toEqual({
      status: 'PAUSED',
      name: { contains: 'outreach', mode: 'insensitive' },
    });
    expect(mockPrisma.campaign.count).toHaveBeenCalledWith({
      where: { status: 'PAUSED', name: { contains: 'outreach', mode: 'insensitive' } },
    });
  });

  it('returns 403 AUTHORIZATION_ERROR for a non-admin caller', async () => {
    asNonAdmin();

    const response = await listCampaigns(listRequest());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(mockPrisma.campaign.findMany).not.toHaveBeenCalled();
  });

  it('returns 401 when there is no session', async () => {
    mockRequireAdmin.mockRejectedValue(new AuthenticationError('Please log in to continue.'));

    const response = await listCampaigns(listRequest());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 500 when the limit exceeds the allowed maximum (zod throws, not a 400)', async () => {
    const response = await listCampaigns(listRequest('?limit=1000'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
    expect(mockPrisma.campaign.findMany).not.toHaveBeenCalled();
  });

  it('returns 500 when the query fails', async () => {
    mockPrisma.campaign.findMany.mockRejectedValue(new Error('connection lost'));

    const response = await listCampaigns(listRequest());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });

  it('returns 500 when the count query fails', async () => {
    mockPrisma.campaign.count.mockRejectedValue(new Error('count failed'));

    const response = await listCampaigns(listRequest());
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

const transitions = [
  {
    label: 'cancel',
    handler: cancelCampaign,
    status: 'CANCELLED',
    message: 'Campaign cancelled.',
    endpoint: 'admin-campaign-cancel',
  },
  {
    label: 'pause',
    handler: pauseCampaign,
    status: 'PAUSED',
    message: 'Campaign paused.',
    endpoint: 'admin-campaign-pause',
  },
] as const;

describe.each(transitions)(
  'POST /api/admin/campaigns/[id]/$label',
  ({ label, handler, status, message, endpoint }) => {
    function actionRequest(id = CAMPAIGN_ID): NextRequest {
      return new NextRequest(`http://localhost/api/admin/campaigns/${id}/${label}`, {
        method: 'POST',
      });
    }

    it(`sets the campaign status to ${status} for any owner`, async () => {
      const response = await handler(actionRequest(), {
        params: Promise.resolve({ id: CAMPAIGN_ID }),
      });
      const body = (await response.json()) as ApiBody;

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toBeNull();
      expect(body.message).toBe(message);
      expect(response.headers.get('X-Request-ID')).toBeTruthy();
      expect(mockPrisma.campaign.findUnique).toHaveBeenCalledWith({
        where: { id: CAMPAIGN_ID },
      });
      expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
        where: { id: CAMPAIGN_ID },
        data: { status },
      });
      expect(mockCheckApiRateLimit).toHaveBeenCalledWith(expect.anything(), ADMIN_ID, endpoint);
    });

    it('returns 404 when the campaign does not exist', async () => {
      mockPrisma.campaign.findUnique.mockResolvedValue(null);

      const response = await handler(actionRequest(), {
        params: Promise.resolve({ id: CAMPAIGN_ID }),
      });
      const body = (await response.json()) as ApiBody;

      expect(response.status).toBe(404);
      expect(body.error?.type).toBe('NOT_FOUND');
      expect(body.error?.message).toBe('Campaign not found.');
      expect(mockPrisma.campaign.update).not.toHaveBeenCalled();
    });

    it('returns 400 for a non-uuid id', async () => {
      const response = await handler(actionRequest('nope'), {
        params: Promise.resolve({ id: 'nope' }),
      });
      const body = (await response.json()) as ApiBody;

      expect(response.status).toBe(400);
      expect(body.error?.type).toBe('VALIDATION_ERROR');
      expect(body.error?.message).toBe('Invalid ID.');
      expect(mockPrisma.campaign.findUnique).not.toHaveBeenCalled();
    });

    it('returns the limiter response when rate limited', async () => {
      rateLimited();

      const response = await handler(actionRequest(), {
        params: Promise.resolve({ id: CAMPAIGN_ID }),
      });
      const body = (await response.json()) as ApiBody;

      expect(response.status).toBe(429);
      expect(body.error?.type).toBe('RATE_LIMITED');
      expect(response.headers.get('Retry-After')).toBe('60');
      expect(mockPrisma.campaign.findUnique).not.toHaveBeenCalled();
    });

    it('returns 403 for a non-admin caller and never touches the limiter', async () => {
      asNonAdmin();

      const response = await handler(actionRequest(), {
        params: Promise.resolve({ id: CAMPAIGN_ID }),
      });
      const body = (await response.json()) as ApiBody;

      expect(response.status).toBe(403);
      expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
      expect(mockCheckApiRateLimit).not.toHaveBeenCalled();
    });

    it('returns 500 when the lookup fails', async () => {
      mockPrisma.campaign.findUnique.mockRejectedValue(new Error('db down'));

      const response = await handler(actionRequest(), {
        params: Promise.resolve({ id: CAMPAIGN_ID }),
      });
      const body = (await response.json()) as ApiBody;

      expect(response.status).toBe(500);
      expect(body.error?.type).toBe('INTERNAL_ERROR');
    });

    it('returns 500 when the status update fails', async () => {
      mockPrisma.campaign.update.mockRejectedValue(new Error('write failed'));

      const response = await handler(actionRequest(), {
        params: Promise.resolve({ id: CAMPAIGN_ID }),
      });
      const body = (await response.json()) as ApiBody;

      expect(response.status).toBe(500);
      expect(body.error?.type).toBe('INTERNAL_ERROR');
    });
  }
);
