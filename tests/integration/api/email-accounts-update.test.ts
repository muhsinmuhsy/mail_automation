import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/email-accounts/[id]/route';

interface ApiResponse {
  success: boolean;
  data?: null;
  error?: { type: string; message: string };
}

const mockPrismaUpdate = {
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
// The route resolves ownership and loads the account via `emailAccount.findUnique`,
// but this suite was written against `findFirst`; alias them so both resolve identically.
mockPrismaUpdate.emailAccount.findUnique = mockPrismaUpdate.emailAccount.findFirst;

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: vi.fn().mockResolvedValue({
    session: { user: { id: 'user-1' } },
  }),
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/security/encryption', () => ({
  encryptSecret: vi.fn().mockResolvedValue('encrypted-secret'),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrismaUpdate),
}));

describe('email-accounts/[id] PATCH', () => {
  beforeEach(() => {
    mockPrismaUpdate.emailAccount.findFirst.mockClear();
    mockPrismaUpdate.emailAccount.update.mockClear();
    mockPrismaUpdate.emailAccount.findFirst.mockResolvedValue({
      id: '07314147-25ec-4cf2-ae63-388e40add7b8',
      user_id: 'user-1',
      is_active: true,
    });
  });

  it('should update the app password when account exists', async () => {
    mockPrismaUpdate.emailAccount.findFirst.mockResolvedValue({ id: '07314147-25ec-4cf2-ae63-388e40add7b8', user_id: 'user-1', is_active: true });
    mockPrismaUpdate.emailAccount.update.mockResolvedValue({ id: '07314147-25ec-4cf2-ae63-388e40add7b8', encrypted_secret: 'encrypted-secret' });

    const request = new NextRequest('http://localhost/api/email-accounts/07314147-25ec-4cf2-ae63-388e40add7b8', {
      method: 'PATCH',
      body: JSON.stringify({ secret: 'new-app-password' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as ApiResponse;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrismaUpdate.emailAccount.update).toHaveBeenCalledWith({
      where: { id: '07314147-25ec-4cf2-ae63-388e40add7b8' },
      data: { encrypted_secret: 'encrypted-secret' },
    });
  });

  it('should reject when secret is missing', async () => {
    const request = new NextRequest('http://localhost/api/email-accounts/07314147-25ec-4cf2-ae63-388e40add7b8', {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as ApiResponse;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrismaUpdate.emailAccount.update).not.toHaveBeenCalled();
  });

  it('should reject when account not found', async () => {
    mockPrismaUpdate.emailAccount.findFirst.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/email-accounts/07314147-25ec-4cf2-ae63-388e40add7b8', {
      method: 'PATCH',
      body: JSON.stringify({ secret: 'new-app-password' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as ApiResponse;

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(mockPrismaUpdate.emailAccount.update).not.toHaveBeenCalled();
  });

  it('should reject when account is deactivated', async () => {
    mockPrismaUpdate.emailAccount.findFirst.mockResolvedValue({ id: '07314147-25ec-4cf2-ae63-388e40add7b8', user_id: 'user-1', is_active: false });

    const request = new NextRequest('http://localhost/api/email-accounts/07314147-25ec-4cf2-ae63-388e40add7b8', {
      method: 'PATCH',
      body: JSON.stringify({ secret: 'new-app-password' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as ApiResponse;

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('BUSINESS_ERROR');
    expect(mockPrismaUpdate.emailAccount.update).not.toHaveBeenCalled();
  });
});
