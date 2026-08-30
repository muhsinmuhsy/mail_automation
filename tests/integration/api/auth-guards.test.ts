import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

interface AuthErrorResponse {
  error: { type: string; message: string };
}

interface ApiFailureResponse {
  success: false;
  error: {
    type: string;
    message: string;
  };
}

const mockPrismaResume = {
  resume: {
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  emailJob: {
    count: vi.fn(),
  },
  $disconnect: vi.fn(),
};

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrismaResume),
}));

const storageDelete = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/storage/storage.factory', () => ({
  createStorageService: vi.fn(() => ({ delete: storageDelete })),
}));

describe('api/resumes/[id] DELETE auth guards', () => {
  beforeEach(() => {
    mockPrismaResume.resume.findFirst.mockClear();
    mockPrismaResume.emailJob.count.mockClear();
    mockPrismaResume.resume.update.mockClear();
    mockPrismaResume.resume.delete.mockClear();
    storageDelete.mockClear();
  });

  async function loadRoute(requireVerifiedSessionResult: unknown) {
    vi.resetModules();
    vi.doMock('@/lib/auth/neon-auth', () => ({
      requireVerifiedSession: vi.fn().mockResolvedValue(requireVerifiedSessionResult),
    }));

    const routeModule = await import('@/app/api/resumes/[id]/route');
    return routeModule.DELETE;
  }

  it('returns 401 when not authenticated', async () => {
    const DELETE = await loadRoute({ error: { type: 'AUTHENTICATION_ERROR', message: 'Please log in to continue.' } });

    const request = new NextRequest('http://localhost/api/resumes/07314147-25ec-4cf2-ae63-388e40add7b8');
    const response = await DELETE(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as AuthErrorResponse;

    expect(response.status).toBe(401);
    expect(body.error.type).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 403 when email not verified', async () => {
    const DELETE = await loadRoute({ error: { type: 'AUTHORIZATION_ERROR', message: 'Please verify your email address to continue.' } });

    const request = new NextRequest('http://localhost/api/resumes/07314147-25ec-4cf2-ae63-388e40add7b8');
    const response = await DELETE(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as AuthErrorResponse;

    expect(response.status).toBe(403);
    expect(body.error.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 404 when resume belongs to another user', async () => {
    const DELETE = await loadRoute({ session: { user: { id: 'user-1' } } });

    mockPrismaResume.resume.findFirst.mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/resumes/07314147-25ec-4cf2-ae63-388e40add7b8');
    const response = await DELETE(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as ApiFailureResponse;

    expect(response.status).toBe(404);
    expect(body.error.type).toBe('NOT_FOUND');
    expect(mockPrismaResume.resume.update).not.toHaveBeenCalled();
  });

  it('deletes resume when owned by current user', async () => {
    const DELETE = await loadRoute({ session: { user: { id: 'user-1' } } });

    mockPrismaResume.resume.findFirst.mockResolvedValue({ id: '07314147-25ec-4cf2-ae63-388e40add7b8', user_id: 'user-1', filename: 'test.pdf', storage_key: 'key', deleted_at: null });
    mockPrismaResume.emailJob.count.mockResolvedValue(0);
    mockPrismaResume.resume.delete.mockResolvedValue({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' });

    const request = new NextRequest('http://localhost/api/resumes/07314147-25ec-4cf2-ae63-388e40add7b8');
    const response = await DELETE(request, { params: Promise.resolve({ id: '07314147-25ec-4cf2-ae63-388e40add7b8' }) });
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(storageDelete).toHaveBeenCalledWith('key');
    expect(mockPrismaResume.resume.delete).toHaveBeenCalledWith({ where: { id: '07314147-25ec-4cf2-ae63-388e40add7b8' } });
  });
});
