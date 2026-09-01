import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from '@/app/api/email-accounts/[id]/route';

interface ApiResponse {
  success: boolean;
  data?: null;
  error?: { type: string; message: string };
}

const mockPrismaDelete = {
  emailAccount: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  emailJob: {
    count: vi.fn(),
  },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  $disconnect: vi.fn(),
};
mockPrismaDelete.emailAccount.findUnique = mockPrismaDelete.emailAccount.findFirst;

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: vi.fn().mockResolvedValue({
    session: { user: { id: 'user-1' } },
  }),
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrismaDelete),
}));

describe('email-accounts/[id] DELETE', () => {
  beforeEach(() => {
    mockPrismaDelete.emailAccount.findFirst.mockClear();
    mockPrismaDelete.emailJob.count.mockClear();
    mockPrismaDelete.emailAccount.update.mockClear();
    mockPrismaDelete.emailAccount.findFirst.mockResolvedValue({
      id: '07314147-25ec-4cf2-ae63-388e40add7b8',
      user_id: 'user-1',
    });
  });

  it('should deactivate email account when no pending jobs', async () => {
    mockPrismaDelete.emailAccount.findFirst.mockResolvedValue({ id: '07314147-25ec-4cf2-ae63-388e40add7b8', user_id: 'user-1' });
    mockPrismaDelete.emailJob.count.mockResolvedValue(0);
    mockPrismaDelete.emailAccount.update.mockResolvedValue({ id: '07314147-25ec-4cf2-ae63-388e40add7b8', is_active: false });

    const request = new NextRequest('http://localhost/api/email-accounts/07314147-25ec-4cf2-ae63-388e40add7b8');
    const response = await DELETE(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as ApiResponse;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaDelete.emailAccount.update).toHaveBeenCalledWith({
      where: { id: '07314147-25ec-4cf2-ae63-388e40add7b8' },
      data: { is_active: false },
    });
  });

  it('deactivates the account when pending jobs exist so it cannot send again', async () => {
    mockPrismaDelete.emailAccount.findFirst.mockResolvedValue({ id: '07314147-25ec-4cf2-ae63-388e40add7b8', user_id: 'user-1' });
    mockPrismaDelete.emailJob.count.mockResolvedValue(3);

    const request = new NextRequest('http://localhost/api/email-accounts/07314147-25ec-4cf2-ae63-388e40add7b8');
    const response = await DELETE(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as ApiResponse;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaDelete.emailAccount.update).toHaveBeenCalledWith({
      where: { id: '07314147-25ec-4cf2-ae63-388e40add7b8' },
      data: { is_active: false },
    });
  });
});
