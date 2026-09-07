import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { ForbiddenError } from '@/lib/errors';
import { GET as listAttachments, POST as uploadAttachment } from '@/app/api/attachments/route';
import { DELETE as deleteAttachment } from '@/app/api/attachments/[id]/route';
import { POST as setDefaultAttachment } from '@/app/api/attachments/[id]/default/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  pagination?: { total: number; page: number; pageSize: number; totalPages: number };
  error?: { type: string; message: string };
}

const ATTACHMENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const { mockRequireVerifiedSession, mockCheckApiRateLimit, storageUpload, storageDelete } =
  vi.hoisted(() => ({
    mockRequireVerifiedSession: vi.fn(),
    mockCheckApiRateLimit: vi.fn(),
    storageUpload: vi.fn(),
    storageDelete: vi.fn(),
  }));

const mockPrisma = {
  attachment: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  emailJob: {
    count: vi.fn(),
  },
  $transaction: vi.fn(),
  $disconnect: vi.fn(),
};
mockPrisma.attachment.findUnique = mockPrisma.attachment.findFirst;

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: mockRequireVerifiedSession,
  getSession: vi.fn().mockImplementation(() => {
    throw new ForbiddenError('Email verification required.');
  }),
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: mockCheckApiRateLimit,
}));

vi.mock('@/lib/rate-limit/middleware', () => ({
  enforceRateLimit: vi.fn(async (identifier: string, key: string) => {
    const res = await mockCheckApiRateLimit({}, identifier, key);
    if (res) {
      const { RateLimitError } = await import('@/lib/errors');
      throw new RateLimitError(
        "You're doing that too frequently. Please wait a moment and try again.",
        60
      );
    }
  }),
}));

vi.mock('@/lib/storage/storage.factory', () => ({
  createStorageService: vi.fn(() => ({ upload: storageUpload, delete: storageDelete })),
}));

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

function authenticated(): void {
  mockRequireVerifiedSession.mockResolvedValue({
    session: { user: { id: 'user-1', email: 'user@example.com', emailVerified: true } },
  });
}

function unauthenticated(): void {
  mockRequireVerifiedSession.mockResolvedValue({
    error: { type: 'AUTHENTICATION_ERROR', message: 'Please log in to continue.' },
  });
}

function unverified(): void {
  mockRequireVerifiedSession.mockResolvedValue({
    error: { type: 'AUTHORIZATION_ERROR', message: 'Please verify your email address to continue.' },
  });
}

function rateLimited(): void {
  mockCheckApiRateLimit.mockResolvedValue(
    NextResponse.json(
      { success: false, error: { type: 'RATE_LIMITED', message: 'Too fast.', retryAfter: 60 } },
      { status: 429, headers: { 'Retry-After': '60' } }
    )
  );
}

function pdfFile(name = 'attachment.pdf', extraBytes = 32): File {
  const header = new TextEncoder().encode('%PDF-1.7\n');
  const bytes = new Uint8Array(header.length + extraBytes);
  bytes.set(header, 0);
  return new File([bytes as unknown as BlobPart], name, { type: 'application/pdf' });
}

function uploadRequest(parts: Array<[string, FormDataEntryValue]>): NextRequest {
  const formData = new FormData();
  for (const [key, value] of parts) {
    formData.append(key, value as string | Blob);
  }
  return new NextRequest('http://localhost/api/attachments', {
    method: 'POST',
    body: formData as unknown as BodyInit,
  });
}

beforeEach(() => {
  authenticated();
  mockCheckApiRateLimit.mockResolvedValue(null);
  storageUpload.mockResolvedValue({ key: 'k', size: 1, contentType: 'application/pdf' });
  storageDelete.mockResolvedValue(undefined);

  mockPrisma.attachment.findMany.mockResolvedValue([
    { id: ATTACHMENT_ID, filename: 'attachment.pdf', is_default: true, created_at: new Date('2030-01-01') },
  ]);
  mockPrisma.attachment.count.mockResolvedValue(1);
  mockPrisma.attachment.findFirst.mockResolvedValue({
    id: ATTACHMENT_ID,
    user_id: 'user-1',
    filename: 'attachment.pdf',
    storage_key: `attachments/user-1/${ATTACHMENT_ID}.pdf`,
    is_default: false,
    deleted_at: null,
  });
  mockPrisma.attachment.create.mockResolvedValue({
    id: ATTACHMENT_ID,
    filename: 'attachment.pdf',
    size_bytes: 41,
    is_default: false,
    created_at: new Date('2030-01-01'),
  });
  mockPrisma.attachment.update.mockResolvedValue({ id: ATTACHMENT_ID });
  mockPrisma.attachment.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.attachment.delete.mockResolvedValue({ id: ATTACHMENT_ID });
  mockPrisma.emailJob.count.mockResolvedValue(0);
  mockPrisma.$transaction.mockResolvedValue([]);
});

describe('GET /api/attachments', () => {
  it('lists non-deleted attachments for the current user', async () => {
    const response = await listAttachments(new NextRequest('http://localhost/api/attachments'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual({ total: 1, page: 1, pageSize: 20, totalPages: 1 });
    expect(mockPrisma.attachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-1', deleted_at: null },
        skip: 0,
        take: 20,
      })
    );
  });

  it('searches by filename and paginates', async () => {
    mockPrisma.attachment.count.mockResolvedValue(7);

    const response = await listAttachments(
      new NextRequest('http://localhost/api/attachments?search=cv&page=2&limit=3')
    );
    const body = (await response.json()) as ApiBody;

    expect(body.pagination).toEqual({ total: 7, page: 2, pageSize: 3, totalPages: 3 });
    const where = mockPrisma.attachment.findMany.mock.calls[0][0].where;
    expect(where.filename).toEqual({ contains: 'cv', mode: 'insensitive' });
    expect(mockPrisma.attachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 3, take: 3 })
    );
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await listAttachments(new NextRequest('http://localhost/api/attachments'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
    expect(mockPrisma.attachment.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await listAttachments(new NextRequest('http://localhost/api/attachments'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when listing fails', async () => {
    mockPrisma.attachment.findMany.mockRejectedValue(new Error('db down'));

    const response = await listAttachments(new NextRequest('http://localhost/api/attachments'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('POST /api/attachments', () => {
  it.each([['notes.txt', 'Hello', 'text/plain'], ['contacts.csv', 'name,email', 'text/csv'], ['slides.pptx', 'PK\x03\x04contents', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']])('uploads %s with the correct storage content type', async (name, data, mime) => {
    const response = await uploadAttachment(uploadRequest([['file', new File([data], name)]]));
    expect(response.status).toBe(201);
    expect(storageUpload.mock.calls[0][0].contentType).toBe(mime);
    expect(storageUpload.mock.calls[0][0].key.endsWith(`.${name.split('.').pop()}`)).toBe(true);
  });
  it('uploads a PDF, stores it and creates the attachment row', async () => {
    const response = await uploadAttachment(uploadRequest([['file', pdfFile()]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Attachment uploaded successfully.');

    expect(storageUpload).toHaveBeenCalledTimes(1);
    const uploadArg = storageUpload.mock.calls[0][0];
    expect(uploadArg.key).toMatch(/^attachments\/user-1\/[0-9a-f-]{36}\.pdf$/);
    expect(uploadArg.contentType).toBe('application/pdf');
    expect(uploadArg.contentLength).toBe(41);
    expect(uploadArg.metadata).toEqual({ userId: 'user-1', originalFilename: 'attachment.pdf' });

    expect(mockPrisma.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'user-1',
          filename: 'attachment.pdf',
          storage_key: uploadArg.key,
          size_bytes: 41,
        }),
      })
    );
    expect(storageDelete).not.toHaveBeenCalled();
  });

  it('returns 400 when no file part is present', async () => {
    const response = await uploadAttachment(uploadRequest([]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toBe('Please select a file.');
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('returns 400 when the file field is not a file', async () => {
    const response = await uploadAttachment(uploadRequest([['file', 'just-a-string']]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Please select a file.');
  });

  it('returns 400 for an empty file', async () => {
    const empty = new File([], 'attachment.pdf', { type: 'application/pdf' });

    const response = await uploadAttachment(uploadRequest([['file', empty]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Attachment must be non-empty and no larger than 5 MB.');
  });

  it('returns 400 for a file larger than 5 MB', async () => {
    const oversized = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1) as unknown as BlobPart],
      'attachment.pdf',
      { type: 'application/pdf' }
    );

    const response = await uploadAttachment(uploadRequest([['file', oversized]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Attachment must be non-empty and no larger than 5 MB.');
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('rejects unsupported executable extensions', async () => {
    const wrongName = new File(
      [new TextEncoder().encode('%PDF-1.7\n') as unknown as BlobPart],
      'attachment.exe',
      { type: 'application/pdf' }
    );

    const response = await uploadAttachment(uploadRequest([['file', wrongName]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Unsupported file type or invalid file contents.');
  });

  it('derives the MIME type from validated content rather than browser metadata', async () => {
    const file = new File(['%PDF-1.7\n'], 'attachment.pdf', { type: 'application/octet-stream' });
    const response = await uploadAttachment(uploadRequest([['file', file]]));
    expect(response.status).toBe(201);
    expect(storageUpload.mock.calls[0][0].contentType).toBe('application/pdf');
  });

  it('returns 400 when the magic bytes are not a PDF header', async () => {
    const notPdf = new File(
      [new TextEncoder().encode('NOT-A-PDF-AT-ALL') as unknown as BlobPart],
      'attachment.pdf',
      { type: 'application/pdf' }
    );

    const response = await uploadAttachment(uploadRequest([['file', notPdf]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Unsupported file type or invalid file contents.');
  });

  it('returns 400 when the file is too short to contain a PDF header', async () => {
    const tiny = new File(
      [new TextEncoder().encode('%PD') as unknown as BlobPart],
      'attachment.pdf',
      { type: 'application/pdf' }
    );

    const response = await uploadAttachment(uploadRequest([['file', tiny]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Unsupported file type or invalid file contents.');
  });

  it('returns 400 when the metadata fails schema validation', async () => {
    const longName = `${'a'.repeat(300)}.pdf`;

    const response = await uploadAttachment(uploadRequest([['file', pdfFile(longName)]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Attachment metadata is invalid.');
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('removes the stored object when the database insert fails', async () => {
    mockPrisma.attachment.create.mockRejectedValue(new Error('insert failed'));

    const response = await uploadAttachment(uploadRequest([['file', pdfFile()]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
    expect(storageDelete).toHaveBeenCalledWith(storageUpload.mock.calls[0][0].key);
  });

  it('swallows storage cleanup failures and still reports the original error', async () => {
    mockPrisma.attachment.create.mockRejectedValue(new Error('insert failed'));
    storageDelete.mockRejectedValue(new Error('cleanup failed'));

    const response = await uploadAttachment(uploadRequest([['file', pdfFile()]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await uploadAttachment(uploadRequest([['file', pdfFile()]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(429);
    expect(body.error?.type).toBe('RATE_LIMITED');
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await uploadAttachment(uploadRequest([['file', pdfFile()]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(mockCheckApiRateLimit).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/attachments/[id]', () => {
  const url = `http://localhost/api/attachments/${ATTACHMENT_ID}`;

  it('hard-deletes the attachment when no pending jobs reference it', async () => {
    const response = await deleteAttachment(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.message).toBe('Attachment deleted.');
    expect(storageDelete).toHaveBeenCalledWith(`attachments/user-1/${ATTACHMENT_ID}.pdf`);
    expect(mockPrisma.attachment.delete).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID } });
    expect(mockPrisma.attachment.update).not.toHaveBeenCalled();
  });

  it('soft-deletes the attachment when pending jobs still need it', async () => {
    mockPrisma.emailJob.count.mockResolvedValue(3);

    const response = await deleteAttachment(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.message).toBe('Attachment removed and retained for pending emails.');
    expect(mockPrisma.attachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ATTACHMENT_ID },
        data: expect.objectContaining({ is_default: false, deleted_at: expect.any(Date) }),
      })
    );
    expect(mockPrisma.attachment.delete).not.toHaveBeenCalled();
    expect(storageDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when the attachment is not owned by the user', async () => {
    mockPrisma.attachment.findFirst.mockResolvedValue(null);

    const response = await deleteAttachment(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(body.error?.message).toBe('Attachment not found.');
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await deleteAttachment(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'bad-id' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.attachment.delete).not.toHaveBeenCalled();
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await deleteAttachment(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });

    expect(response.status).toBe(429);
    expect(mockPrisma.attachment.delete).not.toHaveBeenCalled();
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await deleteAttachment(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when storage deletion fails', async () => {
    storageDelete.mockRejectedValue(new Error('storage offline'));

    const response = await deleteAttachment(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
    expect(mockPrisma.attachment.delete).not.toHaveBeenCalled();
  });
});

describe('POST /api/attachments/[id]/default', () => {
  const url = `http://localhost/api/attachments/${ATTACHMENT_ID}/default`;

  it('clears other defaults and marks the attachment as default', async () => {
    const response = await setDefaultAttachment(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Default attachment set.');
    expect(mockPrisma.attachment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ATTACHMENT_ID } })
    );
    expect(mockPrisma.attachment.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1', deleted_at: null },
      data: { is_default: false },
    });
    expect(mockPrisma.attachment.update).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID },
      data: { is_default: true },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when the attachment does not exist for the user', async () => {
    mockPrisma.attachment.findFirst.mockResolvedValue(null);

    const response = await setDefaultAttachment(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await setDefaultAttachment(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: 'nope' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await setDefaultAttachment(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });

    expect(response.status).toBe(429);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await setDefaultAttachment(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 500 when the transaction fails', async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error('tx failed'));

    const response = await setDefaultAttachment(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: ATTACHMENT_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});
