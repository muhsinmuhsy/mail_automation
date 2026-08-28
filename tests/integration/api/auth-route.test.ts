import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

interface MockHandler {
  GET: ReturnType<typeof vi.fn>;
  POST: ReturnType<typeof vi.fn>;
  DELETE: ReturnType<typeof vi.fn>;
  PUT: ReturnType<typeof vi.fn>;
  PATCH: ReturnType<typeof vi.fn>;
}

async function loadAuthRoute() {
  const mockHandler = {
    GET: vi.fn(),
    POST: vi.fn(),
    DELETE: vi.fn(),
    PUT: vi.fn(),
    PATCH: vi.fn(),
  } as MockHandler;

  vi.doMock('@/lib/auth/neon-auth', () => ({
    auth: {
      handler: () => mockHandler,
    },
  }));

  const routeModule = await import('@/app/api/auth/[...path]/route');
  return { routeModule, mockHandler };
}

function resetAuthMock() {
  vi.resetModules();
  vi.clearAllMocks();
}

describe('app/api/auth/[...path]/route', () => {
  it('GET delegates to auth.handler().GET', async () => {
    const { routeModule, mockHandler } = await loadAuthRoute();
    mockHandler.GET.mockResolvedValue(new Response('OK'));
    const request = new NextRequest('http://localhost/api/auth/session');
    const response = await routeModule.GET(request, { params: Promise.resolve({}) });
    expect(mockHandler.GET).toHaveBeenCalledWith(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    resetAuthMock();
  });

  it('POST delegates to auth.handler().POST', async () => {
    const { routeModule, mockHandler } = await loadAuthRoute();
    mockHandler.POST.mockResolvedValue(new Response('OK'));
    const request = new NextRequest('http://localhost/api/auth/sign-up/email', { method: 'POST' });
    const response = await routeModule.POST(request, { params: Promise.resolve({}) });
    expect(mockHandler.POST).toHaveBeenCalledWith(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    resetAuthMock();
  });

  it('DELETE delegates to auth.handler().DELETE', async () => {
    const { routeModule, mockHandler } = await loadAuthRoute();
    mockHandler.DELETE.mockResolvedValue(new Response('OK'));
    const request = new NextRequest('http://localhost/api/auth/session', { method: 'DELETE' });
    const response = await routeModule.DELETE(request, { params: Promise.resolve({}) });
    expect(mockHandler.DELETE).toHaveBeenCalledWith(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    resetAuthMock();
  });

  it('PUT delegates to auth.handler().PUT', async () => {
    const { routeModule, mockHandler } = await loadAuthRoute();
    mockHandler.PUT.mockResolvedValue(new Response('OK'));
    const request = new NextRequest('http://localhost/api/auth/user', { method: 'PUT' });
    const response = await routeModule.PUT(request, { params: Promise.resolve({}) });
    expect(mockHandler.PUT).toHaveBeenCalledWith(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    resetAuthMock();
  });

  it('PATCH delegates to auth.handler().PATCH', async () => {
    const { routeModule, mockHandler } = await loadAuthRoute();
    mockHandler.PATCH.mockResolvedValue(new Response('OK'));
    const request = new NextRequest('http://localhost/api/auth/user', { method: 'PATCH' });
    const response = await routeModule.PATCH(request, { params: Promise.resolve({}) });
    expect(mockHandler.PATCH).toHaveBeenCalledWith(request, { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    resetAuthMock();
  });
});
