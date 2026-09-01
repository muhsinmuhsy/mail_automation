import { describe, it, expect, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockAuthGetSession = vi.fn();

vi.mock('@/lib/auth/neon-auth', () => ({
  auth: {
    getSession: () => mockAuthGetSession(),
    middleware: () => vi.fn(),
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

describe('proxy unverified user behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function loadProxy() {
    vi.resetModules();
    vi.doMock('@/lib/auth/neon-auth', () => ({
      auth: {
        getSession: () => mockAuthGetSession(),
        middleware: () => vi.fn().mockResolvedValue(NextResponse.next()),
      },
    }));

    vi.doMock('@/lib/rate-limit', () => ({
      createRateLimiter: vi.fn(() => ({
        check: vi.fn().mockResolvedValue({ success: true }),
      })),
    }));

    const proxyModule = await import('@/proxy');
    return proxyModule.default;
  }

  it('allows unauthenticated access to /register', async () => {
    mockAuthGetSession.mockResolvedValue(null);
    const proxyHandler = await loadProxy();

    const request = new NextRequest('http://localhost/register');
    const response = await proxyHandler(request);

    expect(response.status).toBe(200);
  });

  it('allows public health checks without a session lookup', async () => {
    mockAuthGetSession.mockResolvedValue(null);
    const proxyHandler = await loadProxy();

    const request = new NextRequest('http://localhost/api/health');
    const response = await proxyHandler(request);

    expect(response.status).toBe(200);
    expect(mockAuthGetSession).not.toHaveBeenCalled();
  });

  it('redirects unverified authenticated user from /dashboard to /verify-email', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          emailVerified: false,
        },
      },
    });
    const proxyHandler = await loadProxy();

    const request = new NextRequest('http://localhost/dashboard');
    const response = await proxyHandler(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/verify-email');
  });

  it('allows verified authenticated user to access /dashboard', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          emailVerified: true,
        },
      },
    });
    const proxyHandler = await loadProxy();

    const request = new NextRequest('http://localhost/dashboard');
    const response = await proxyHandler(request);

    expect(response.status).toBe(200);
  });

  it('allows unverified user to access /verify-email', async () => {
    mockAuthGetSession.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          emailVerified: false,
        },
      },
    });
    const proxyHandler = await loadProxy();

    const request = new NextRequest('http://localhost/verify-email');
    const response = await proxyHandler(request);

    expect(response.status).toBe(200);
  });
});
