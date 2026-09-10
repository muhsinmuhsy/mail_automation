import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/email-accounts/route';
import { POST } from '@/app/api/email-accounts/route';

interface ApiResponse {
  success: boolean;
  data?: unknown;
  error?: { type: string; message: string };
}

const mockPrisma = {
  emailAccount: {
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn().mockResolvedValue(1),
  },
  user: {
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  $disconnect: vi.fn(),
};

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
  decryptSecret: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

describe('email-accounts GET/POST', () => {
  beforeEach(() => {
    mockPrisma.emailAccount.findMany.mockClear();
    mockPrisma.emailAccount.create.mockClear();
    mockPrisma.user.upsert.mockClear();
  });

  it('should return user email accounts', async () => {
    mockPrisma.emailAccount.findMany.mockResolvedValue([
      { id: '1', provider: 'gmail', email: 'test@gmail.com', is_active: true, created_at: new Date() },
    ]);

    const request = new NextRequest('http://localhost/api/email-accounts');
    const response = await GET(request);
    const body = (await response.json()) as ApiResponse;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  // App password disabled — commented out for future re-enablement
  /*
  it('should create email account', async () => {
    mockPrisma.emailAccount.create.mockResolvedValue({
      id: '1',
      provider: 'gmail',
      email: 'test@gmail.com',
      is_active: true,
      created_at: new Date(),
    });

    const request = new NextRequest('http://localhost/api/email-accounts', {
      method: 'POST',
      body: JSON.stringify({ provider: 'gmail', email: 'test@gmail.com', auth_method: 'app_password', secret: 'app-password' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    const body = (await response.json()) as ApiResponse;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(mockPrisma.emailAccount.create).toHaveBeenCalled();
  });
  */
});
