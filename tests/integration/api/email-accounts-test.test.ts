import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/email-accounts/[id]/test/route';

interface ApiResponse {
  success: boolean;
  data?: { connected: boolean; message: string };
  error?: { type: string; message: string };
}

const mockPrismaTest = {
  emailAccount: {
    findUnique: vi.fn(),
  },
  systemSetting: { findUnique: vi.fn().mockResolvedValue(null) },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  $disconnect: vi.fn(),
};

const mockTestConnection = vi.fn();

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: vi.fn().mockResolvedValue({
    session: { user: { id: 'user-1' } },
  }),
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/security/encryption', () => ({
  decryptSecret: vi.fn().mockResolvedValue('app-password'),
}));

vi.mock('@/lib/email/providers/gmail', () => ({
  GmailProvider: vi.fn().mockImplementation(() => ({
    testConnection: mockTestConnection,
  })),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrismaTest),
}));

describe('email-accounts/[id]/test POST', () => {
  // App password disabled — commented out for future re-enablement
  it.skip('app password tests disabled — commented out for future re-enablement', () => {});

  beforeEach(() => {
    mockPrismaTest.emailAccount.findUnique.mockClear();
    mockTestConnection.mockClear();
  });

  // App password disabled — commented out for future re-enablement
  /*
  it('should test connection successfully', async () => {
    mockTestConnection.mockResolvedValue({ success: true, message: 'Connection successful' });

    mockPrismaTest.emailAccount.findUnique.mockResolvedValue({
      id: '07314147-25ec-4cf2-ae63-388e40add7b8',
      user_id: 'user-1',
      email: 'test@gmail.com',
      encrypted_secret: 'encrypted',
    });

    const request = new NextRequest('http://localhost/api/email-accounts/07314147-25ec-4cf2-ae63-388e40add7b8/test', {
      method: 'POST',
    });
    const response = await POST(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as ApiResponse;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.connected).toBe(true);
  });

  it('should reject when account not found', async () => {
    mockPrismaTest.emailAccount.findUnique.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/email-accounts/07314147-25ec-4cf2-ae63-388e40add7b8/test', {
      method: 'POST',
    });
    const response = await POST(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as ApiResponse;

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error?.type).toBe('NOT_FOUND');
  });
  */
});
