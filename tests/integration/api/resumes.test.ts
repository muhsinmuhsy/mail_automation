import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET as listResumes, POST as uploadResume } from '@/app/api/resumes/route';
import { DELETE as deleteResume } from '@/app/api/resumes/[id]/route';
import { POST as setDefaultResume } from '@/app/api/resumes/[id]/default/route';

interface ApiBody {
  success: boolean;
  data?: unknown;
  message?: string;
  pagination?: { total: number; page: number; pageSize: number; totalPages: number };
  error?: { type: string; message: string };
}

const RESUME_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const { mockRequireVerifiedSession, mockCheckApiRateLimit, storageUpload, storageDelete } =
  vi.hoisted(() => ({
    mockRequireVerifiedSession: vi.fn(),
    mockCheckApiRateLimit: vi.fn(),
    storageUpload: vi.fn(),
    storageDelete: vi.fn(),
  }));

const mockPrisma = {
  resume: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  emailJob: {
    count: vi.fn(),
  },
  $transaction: vi.fn(),
  $disconnect: vi.fn(),
};

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: mockRequireVerifiedSession,
}));

vi.mock('@/lib/rate-limit/api', () => ({
  checkApiRateLimit: mockCheckApiRateLimit,
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

function pdfFile(name = 'resume.pdf', extraBytes = 32): File {
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
  return new NextRequest('http://localhost/api/resumes', {
    method: 'POST',
    body: formData as unknown as BodyInit,
  });
}

beforeEach(() => {
  authenticated();
  mockCheckApiRateLimit.mockResolvedValue(null);
  storageUpload.mockResolvedValue({ key: 'k', size: 1, contentType: 'application/pdf' });
  storageDelete.mockResolvedValue(undefined);

  mockPrisma.resume.findMany.mockResolvedValue([
    { id: RESUME_ID, filename: 'resume.pdf', is_default: true, created_at: new Date('2030-01-01') },
  ]);
  mockPrisma.resume.count.mockResolvedValue(1);
  mockPrisma.resume.findFirst.mockResolvedValue({
    id: RESUME_ID,
    user_id: 'user-1',
    filename: 'resume.pdf',
    storage_key: `resumes/user-1/${RESUME_ID}.pdf`,
    is_default: false,
    deleted_at: null,
  });
  mockPrisma.resume.create.mockResolvedValue({
    id: RESUME_ID,
    filename: 'resume.pdf',
    size_bytes: 41,
    is_default: false,
    created_at: new Date('2030-01-01'),
  });
  mockPrisma.resume.update.mockResolvedValue({ id: RESUME_ID });
  mockPrisma.resume.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.resume.delete.mockResolvedValue({ id: RESUME_ID });
  mockPrisma.emailJob.count.mockResolvedValue(0);
  mockPrisma.$transaction.mockResolvedValue([]);
});

describe('GET /api/resumes', () => {
  it('lists non-deleted resumes for the current user', async () => {
    const response = await listResumes(new NextRequest('http://localhost/api/resumes'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual({ total: 1, page: 1, pageSize: 20, totalPages: 1 });
    expect(mockPrisma.resume.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-1', deleted_at: null },
        skip: 0,
        take: 20,
      })
    );
  });

  it('searches by filename and paginates', async () => {
    mockPrisma.resume.count.mockResolvedValue(7);

    const response = await listResumes(
      new NextRequest('http://localhost/api/resumes?search=cv&page=2&limit=3')
    );
    const body = (await response.json()) as ApiBody;

    expect(body.pagination).toEqual({ total: 7, page: 2, pageSize: 3, totalPages: 3 });
    const where = mockPrisma.resume.findMany.mock.calls[0][0].where;
    expect(where.filename).toEqual({ contains: 'cv', mode: 'insensitive' });
    expect(mockPrisma.resume.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 3, take: 3 })
    );
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await listResumes(new NextRequest('http://localhost/api/resumes'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
    expect(mockPrisma.resume.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await listResumes(new NextRequest('http://localhost/api/resumes'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when listing fails', async () => {
    mockPrisma.resume.findMany.mockRejectedValue(new Error('db down'));

    const response = await listResumes(new NextRequest('http://localhost/api/resumes'));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});

describe('POST /api/resumes', () => {
  it('uploads a PDF, stores it and creates the resume row', async () => {
    const response = await uploadResume(uploadRequest([['file', pdfFile()]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Resume uploaded successfully.');

    expect(storageUpload).toHaveBeenCalledTimes(1);
    const uploadArg = storageUpload.mock.calls[0][0];
    expect(uploadArg.key).toMatch(/^resumes\/user-1\/[0-9a-f-]{36}\.pdf$/);
    expect(uploadArg.contentType).toBe('application/pdf');
    expect(uploadArg.contentLength).toBe(41);
    expect(uploadArg.metadata).toEqual({ userId: 'user-1', originalFilename: 'resume.pdf' });

    expect(mockPrisma.resume.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'user-1',
          filename: 'resume.pdf',
          storage_key: uploadArg.key,
          size_bytes: 41,
        }),
      })
    );
    expect(storageDelete).not.toHaveBeenCalled();
  });

  it('returns 400 when no file part is present', async () => {
    const response = await uploadResume(uploadRequest([]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(body.error?.message).toBe('Please select a file.');
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('returns 400 when the file field is not a file', async () => {
    const response = await uploadResume(uploadRequest([['file', 'just-a-string']]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Please select a file.');
  });

  it('returns 400 for an empty file', async () => {
    const empty = new File([], 'resume.pdf', { type: 'application/pdf' });

    const response = await uploadResume(uploadRequest([['file', empty]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Resume must be a PDF no larger than 5 MB.');
  });

  it('returns 400 for a file larger than 5 MB', async () => {
    const oversized = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1) as unknown as BlobPart],
      'resume.pdf',
      { type: 'application/pdf' }
    );

    const response = await uploadResume(uploadRequest([['file', oversized]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Resume must be a PDF no larger than 5 MB.');
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('returns 400 when the extension is not .pdf', async () => {
    const wrongName = new File(
      [new TextEncoder().encode('%PDF-1.7\n') as unknown as BlobPart],
      'resume.txt',
      { type: 'application/pdf' }
    );

    const response = await uploadResume(uploadRequest([['file', wrongName]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Resume must be a valid PDF file.');
  });

  it('returns 400 when the mime type is not application/pdf', async () => {
    const wrongType = new File(
      [new TextEncoder().encode('%PDF-1.7\n') as unknown as BlobPart],
      'resume.pdf',
      { type: 'text/plain' }
    );

    const response = await uploadResume(uploadRequest([['file', wrongType]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Resume must be a valid PDF file.');
  });

  it('returns 400 when the magic bytes are not a PDF header', async () => {
    const notPdf = new File(
      [new TextEncoder().encode('NOT-A-PDF-AT-ALL') as unknown as BlobPart],
      'resume.pdf',
      { type: 'application/pdf' }
    );

    const response = await uploadResume(uploadRequest([['file', notPdf]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Resume must be a valid PDF file.');
  });

  it('returns 400 when the file is too short to contain a PDF header', async () => {
    const tiny = new File(
      [new TextEncoder().encode('%PD') as unknown as BlobPart],
      'resume.pdf',
      { type: 'application/pdf' }
    );

    const response = await uploadResume(uploadRequest([['file', tiny]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Resume must be a valid PDF file.');
  });

  it('returns 400 when the metadata fails schema validation', async () => {
    const longName = `${'a'.repeat(300)}.pdf`;

    const response = await uploadResume(uploadRequest([['file', pdfFile(longName)]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toBe('Resume metadata is invalid.');
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('removes the stored object when the database insert fails', async () => {
    mockPrisma.resume.create.mockRejectedValue(new Error('insert failed'));

    const response = await uploadResume(uploadRequest([['file', pdfFile()]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
    expect(storageDelete).toHaveBeenCalledWith(storageUpload.mock.calls[0][0].key);
  });

  it('swallows storage cleanup failures and still reports the original error', async () => {
    mockPrisma.resume.create.mockRejectedValue(new Error('insert failed'));
    storageDelete.mockRejectedValue(new Error('cleanup failed'));

    const response = await uploadResume(uploadRequest([['file', pdfFile()]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await uploadResume(uploadRequest([['file', pdfFile()]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(429);
    expect(body.error?.type).toBe('RATE_LIMITED');
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await uploadResume(uploadRequest([['file', pdfFile()]]));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
    expect(mockCheckApiRateLimit).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/resumes/[id]', () => {
  const url = `http://localhost/api/resumes/${RESUME_ID}`;

  it('hard-deletes the resume when no pending jobs reference it', async () => {
    const response = await deleteResume(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: RESUME_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.message).toBe('Resume deleted.');
    expect(storageDelete).toHaveBeenCalledWith(`resumes/user-1/${RESUME_ID}.pdf`);
    expect(mockPrisma.resume.delete).toHaveBeenCalledWith({ where: { id: RESUME_ID } });
    expect(mockPrisma.resume.update).not.toHaveBeenCalled();
  });

  it('soft-deletes the resume when pending jobs still need it', async () => {
    mockPrisma.emailJob.count.mockResolvedValue(3);

    const response = await deleteResume(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: RESUME_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.message).toBe('Resume removed and retained for pending emails.');
    expect(mockPrisma.resume.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RESUME_ID },
        data: expect.objectContaining({ is_default: false, deleted_at: expect.any(Date) }),
      })
    );
    expect(mockPrisma.resume.delete).not.toHaveBeenCalled();
    expect(storageDelete).not.toHaveBeenCalled();
  });

  it('returns 404 when the resume is not owned by the user', async () => {
    mockPrisma.resume.findFirst.mockResolvedValue(null);

    const response = await deleteResume(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: RESUME_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(body.error?.message).toBe('Resume not found.');
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await deleteResume(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'bad-id' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockPrisma.resume.findFirst).not.toHaveBeenCalled();
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await deleteResume(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: RESUME_ID }),
    });

    expect(response.status).toBe(429);
    expect(mockPrisma.resume.findFirst).not.toHaveBeenCalled();
  });

  it('returns 403 for an unverified user', async () => {
    unverified();

    const response = await deleteResume(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: RESUME_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(403);
    expect(body.error?.type).toBe('AUTHORIZATION_ERROR');
  });

  it('returns 500 when storage deletion fails', async () => {
    storageDelete.mockRejectedValue(new Error('storage offline'));

    const response = await deleteResume(new NextRequest(url, { method: 'DELETE' }), {
      params: Promise.resolve({ id: RESUME_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
    expect(mockPrisma.resume.delete).not.toHaveBeenCalled();
  });
});

describe('POST /api/resumes/[id]/default', () => {
  const url = `http://localhost/api/resumes/${RESUME_ID}/default`;

  it('clears other defaults and marks the resume as default', async () => {
    const response = await setDefaultResume(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: RESUME_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Default resume set.');
    expect(mockPrisma.resume.findFirst).toHaveBeenCalledWith({
      where: { id: RESUME_ID, user_id: 'user-1', deleted_at: null },
    });
    expect(mockPrisma.resume.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1', deleted_at: null },
      data: { is_default: false },
    });
    expect(mockPrisma.resume.update).toHaveBeenCalledWith({
      where: { id: RESUME_ID },
      data: { is_default: true },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when the resume does not exist for the user', async () => {
    mockPrisma.resume.findFirst.mockResolvedValue(null);

    const response = await setDefaultResume(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: RESUME_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(404);
    expect(body.error?.type).toBe('NOT_FOUND');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-uuid id', async () => {
    const response = await setDefaultResume(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: 'nope' }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
  });

  it('returns the rate-limit response when limited', async () => {
    rateLimited();

    const response = await setDefaultResume(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: RESUME_ID }),
    });

    expect(response.status).toBe(429);
    expect(mockPrisma.resume.findFirst).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    unauthenticated();

    const response = await setDefaultResume(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: RESUME_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
  });

  it('returns 500 when the transaction fails', async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error('tx failed'));

    const response = await setDefaultResume(new NextRequest(url, { method: 'POST' }), {
      params: Promise.resolve({ id: RESUME_ID }),
    });
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(500);
    expect(body.error?.type).toBe('INTERNAL_ERROR');
  });
});
