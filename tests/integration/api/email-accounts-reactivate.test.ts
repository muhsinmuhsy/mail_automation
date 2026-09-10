import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/email-accounts/[id]/reactivate/route';

interface ApiResponse {
  success: boolean;
  data?: null;
  error?: { type: string; message: string };
}

const mockPrismaReactivate = {
  emailAccount: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  $disconnect: vi.fn(),
};
mockPrismaReactivate.emailAccount.findUnique = mockPrismaReactivate.emailAccount.findFirst;

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: vi.fn().mockResolvedValue({
    session: { user: { id: 'user-1' } },
  }),
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrismaReactivate),
}));

describe('email-accounts/[id]/reactivate POST', () => {
  // App password disabled — commented out for future re-enablement
  it.skip('app password tests disabled — commented out for future re-enablement', () => {});

  beforeEach(() => {
    mockPrismaReactivate.emailAccount.findFirst.mockClear();
    mockPrismaReactivate.emailAccount.update.mockClear();
    mockPrismaReactivate.emailAccount.findFirst.mockResolvedValue({
      id: '07314147-25ec-4cf2-ae63-388e40add7b8',
      user_id: 'user-1',
      is_active: false,
    });
  });

  // App password disabled — commented out for future re-enablement
  /*
  it('should reactivate the email account', async () => {
    mockPrismaReactivate.emailAccount.findFirst.mockResolvedValue({ id: '07314147-25ec-4cf2-ae63-388e40add7b8', user_id: 'user-1', is_active: false });
    mockPrismaReactivate.emailAccount.update.mockResolvedValue({ id: '07314147-25ec-4cf2-ae63-388e40add7b8', is_active: true });

    const request = new NextRequest('http://localhost/api/email-accounts/07314147-25ec-4cf2-ae63-388e40add7b8/reactivate', {
      method: 'POST',
    });
    const response = await POST(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as ApiResponse;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaReactivate.emailAccount.update).toHaveBeenCalledWith({
      where: { id: '07314147-25ec-4cf2-ae63-388e40add7b8' },
      data: { is_active: true },
    });
  });

  it('should reject when account not found', async () => {
    mockPrismaReactivate.emailAccount.findFirst.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/email-accounts/07314147-25ec-4cf2-ae63-388e40add7b8/reactivate', {
      method: 'POST',
    });
    const response = await POST(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as ApiResponse;

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(mockPrismaReactivate.emailAccount.update).not.toHaveBeenCalled();
  });
  */
});
