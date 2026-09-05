import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/errors';
import { DELETE } from '@/app/api/attachments/[id]/route';

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

const ATTACHMENT_ID = '07314147-25ec-4cf2-ae63-388e40add7b8';

const mockPrismaAttachment = {
  attachment: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  emailJob: {
    count: vi.fn(),
  },
  $disconnect: vi.fn(),
};
mockPrismaAttachment.attachment.findUnique = mockPrismaAttachment.attachment.findFirst;

const { mockRequireVerifiedSession } = vi.hoisted(() => ({
  mockRequireVerifiedSession: vi.fn(),
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrismaAttachment),
}));

const storageDelete = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/storage/storage.factory', () => ({
  createStorageService: vi.fn(() => ({ delete: storageDelete })),
}));

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: mockRequireVerifiedSession,
}));

describe('api/attachments/[id] DELETE auth guards', () => {
  beforeEach(() => {
    mockPrismaAttachment.attachment.findFirst.mockClear();
    mockPrismaAttachment.emailJob.count.mockClear();
    mockPrismaAttachment.attachment.update.mockClear();
    mockPrismaAttachment.attachment.delete.mockClear();
    storageDelete.mockClear();
    mockRequireVerifiedSession.mockReset();
    mockPrismaAttachment.attachment.findFirst.mockResolvedValue({
      id: ATTACHMENT_ID,
      user_id: 'user-1',
      deleted_at: null,
    });
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireVerifiedSession.mockResolvedValue({
      error: { type: 'AUTHENTICATION_ERROR', message: 'Please log in to continue.' },
    });

    const request = new NextRequest(`http://localhost/api/attachments/${ATTACHMENT_ID}`);
    const response = await DELETE(request, {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as AuthErrorResponse;

    expect(response.status).toBe(401);
    expect(body.error.type).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 403 when email not verified', async () => {
    mockRequireVerifiedSession.mockRejectedValue(
      new ForbiddenError('Please verify your email address to continue.')
    );

    const request = new NextRequest(`http://localhost/api/attachments/${ATTACHMENT_ID}`);
    const response = await DELETE(request, {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as AuthErrorResponse;

    expect(response.status).toBe(403);
    expect(body.error.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 404 when attachment belongs to another user', async () => {
    mockRequireVerifiedSession.mockResolvedValue({ session: { user: { id: 'user-1' } } });
    mockPrismaAttachment.attachment.findFirst.mockResolvedValue(null);

    const request = new NextRequest(`http://localhost/api/attachments/${ATTACHMENT_ID}`);
    const response = await DELETE(request, {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as ApiFailureResponse;

    expect(response.status).toBe(404);
    expect(body.error.type).toBe('NOT_FOUND');
    expect(mockPrismaAttachment.attachment.update).not.toHaveBeenCalled();
  });

  it('deletes attachment when owned by current user', async () => {
    mockRequireVerifiedSession.mockResolvedValue({ session: { user: { id: 'user-1' } } });
    mockPrismaAttachment.attachment.findFirst.mockResolvedValue({
      id: ATTACHMENT_ID,
      user_id: 'user-1',
      filename: 'test.pdf',
      storage_key: 'key',
      deleted_at: null,
    });
    mockPrismaAttachment.emailJob.count.mockResolvedValue(0);
    mockPrismaAttachment.attachment.delete.mockResolvedValue({ id: ATTACHMENT_ID });

    const request = new NextRequest(`http://localhost/api/attachments/${ATTACHMENT_ID}`);
    const response = await DELETE(request, {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(storageDelete).toHaveBeenCalledWith('key');
    expect(mockPrismaAttachment.attachment.delete).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID },
    });
  });
});
