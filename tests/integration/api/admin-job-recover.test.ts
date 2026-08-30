import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/jobs/[id]/recover/route';

const mockResolve = vi.fn();

const mockPrisma = {
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'ADMIN', is_active: true }),
  },
  emailJob: {
    findUnique: vi.fn(),
  },
};

vi.mock('@/lib/auth/neon-auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'admin', email: 'a@b.com', emailVerified: true } }),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/limits/email-limit-service', () => ({
  resolveDeliveryUnknown: (...args: unknown[]) => mockResolve(...args),
}));

describe('admin jobs/:id/recover', () => {
  const jobId = '07314147-25ec-4cf2-ae63-388e40add7b8';

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN', is_active: true });
    mockResolve.mockImplementation(async (_prisma: unknown, p: { decision: string }) => p.decision);
  });

  function makeRequest(decision: unknown) {
    return new NextRequest(`http://localhost/api/admin/jobs/${jobId}/recover`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('resolves a DELIVERY_UNKNOWN job with the chosen decision', async () => {
    mockPrisma.emailJob.findUnique.mockResolvedValue({
      id: jobId,
      status: 'DELIVERY_UNKNOWN',
      user_id: 'u1',
      campaign_id: 'c1',
    });

    const response = await POST(makeRequest('sent'), { params: Promise.resolve({ id: jobId }) });
    const body = (await response.json()) as { success: boolean; data: { decision: string; status: string } };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.decision).toBe('sent');
    expect(body.data.status).toBe('SENT');
    expect(mockResolve).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ emailJobId: jobId, userId: 'u1', campaignId: 'c1', decision: 'sent' })
    );
  });

  it('returns 404 when the job does not exist', async () => {
    mockPrisma.emailJob.findUnique.mockResolvedValue(null);

    const response = await POST(makeRequest('sent'), { params: Promise.resolve({ id: jobId }) });
    const body = (await response.json()) as { success: boolean; error?: { type: string } };

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid decision', async () => {
    mockPrisma.emailJob.findUnique.mockResolvedValue({ id: jobId, status: 'DELIVERY_UNKNOWN', user_id: 'u1', campaign_id: null });

    const response = await POST(makeRequest('maybe'), { params: Promise.resolve({ id: jobId }) });
    const body = (await response.json()) as { success: boolean; error?: { type: string } };

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
  });

  it('leaves the job in DELIVERY_UNKNOWN for the "unknown" decision', async () => {
    mockPrisma.emailJob.findUnique.mockResolvedValue({ id: jobId, status: 'DELIVERY_UNKNOWN', user_id: 'u1', campaign_id: null });

    const response = await POST(makeRequest('unknown'), { params: Promise.resolve({ id: jobId }) });
    const body = (await response.json()) as { success: boolean; data: { status: string } };

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('DELIVERY_UNKNOWN');
  });
});
