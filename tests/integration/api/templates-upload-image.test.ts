import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as uploadImage } from '@/app/api/templates/upload-image/route';

interface ApiBody {
  success: boolean;
  data?: { id: string; url: string; filename: string; size_bytes: number };
  message?: string;
  error?: { type: string; message: string; fields?: Record<string, string> };
}

const { mockRequireVerifiedSession, mockCheckApiRateLimit } = vi.hoisted(() => ({
  mockRequireVerifiedSession: vi.fn(),
  mockCheckApiRateLimit: vi.fn(),
}));

const mockUpload = vi.fn();
const mockDelete = vi.fn();

const mockPrisma = {
  attachment: {
    create: vi.fn(),
  },
  systemSetting: { findUnique: vi.fn().mockResolvedValue(null) },
  user: {
    findUnique: vi.fn().mockResolvedValue({ role: 'USER', is_active: true }),
    upsert: vi.fn().mockResolvedValue({ id: 'user-1' }),
  },
  $disconnect: vi.fn(),
};

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: mockRequireVerifiedSession,
  getSession: vi.fn(async () => {
    const result = await mockRequireVerifiedSession();
    return 'session' in result ? result.session : null;
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

vi.mock('@/lib/db', () => ({
  getPrisma: vi.fn(() => mockPrisma),
}));

vi.mock('@/lib/storage/storage.factory', () => ({
  createStorageService: vi.fn(() => ({
    upload: mockUpload,
    delete: mockDelete,
  })),
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

function formDataRequest(file: File): NextRequest {
  const form = new FormData();
  form.append('file', file);
  return new NextRequest('http://localhost/api/templates/upload-image', {
    method: 'POST',
    body: form,
  });
}

function makeFile(bytes: Uint8Array, name: string, type: string): File {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new File([ab], name, { type });
}

function createPngBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes[0] = 137; bytes[1] = 80; bytes[2] = 78; bytes[3] = 71;
  bytes[4] = 13; bytes[5] = 10; bytes[6] = 26; bytes[7] = 10;
  return bytes;
}

function createJpegBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes[0] = 255; bytes[1] = 216; bytes[2] = 255;
  return bytes;
}

function createGifBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  const header = new TextEncoder().encode('GIF89a');
  bytes.set(header, 0);
  return bytes;
}

function createWebpBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  const header = new TextEncoder().encode('RIFF');
  bytes.set(header, 0);
  const webp = new TextEncoder().encode('WEBP');
  bytes.set(webp, 8);
  return bytes;
}

beforeEach(() => {
  authenticated();
  mockCheckApiRateLimit.mockResolvedValue(null);
  mockUpload.mockResolvedValue({ key: 'test-key', size: 64, contentType: 'image/png' });
  mockDelete.mockResolvedValue(undefined);
  mockPrisma.attachment.create.mockImplementation(async (args: { data: { filename: string; storage_key: string; size_bytes: number } }) => ({
    id: 'att-1',
    filename: args.data.filename,
    storage_key: args.data.storage_key,
    size_bytes: args.data.size_bytes,
    created_at: new Date('2030-01-01'),
  }));
});

describe('POST /api/templates/upload-image', () => {
  it('uploads a valid PNG and returns a public URL', async () => {
    const bytes = createPngBytes();
    const file = makeFile(bytes, 'logo.png', 'image/png');

    const response = await uploadImage(formDataRequest(file));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data?.url).toMatch(/^https:\/\//);
    expect(body.data?.url).toContain('templates/user-1/');
    expect(body.data?.filename).toBe('logo.png');
    expect(body.data?.size_bytes).toBe(64);
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockPrisma.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'user-1',
          filename: 'logo.png',
        }),
      })
    );
  });

  it('uploads a valid JPEG', async () => {
    const bytes = createJpegBytes();
    const file = makeFile(bytes, 'photo.jpg', 'image/jpeg');

    const response = await uploadImage(formDataRequest(file));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
  });

  it('uploads a valid GIF', async () => {
    const bytes = createGifBytes();
    const file = makeFile(bytes, 'animation.gif', 'image/gif');

    const response = await uploadImage(formDataRequest(file));
    expect(response.status).toBe(201);
  });

  it('uploads a valid WebP', async () => {
    const bytes = createWebpBytes();
    const file = makeFile(bytes, 'image.webp', 'image/webp');

    const response = await uploadImage(formDataRequest(file));
    expect(response.status).toBe(201);
  });

  it('rejects a non-image file (PDF)', async () => {
    const bytes = new Uint8Array(64);
    const header = new TextEncoder().encode('%PDF-');
    bytes.set(header, 0);
    const file = makeFile(bytes, 'document.pdf', 'application/pdf');

    const response = await uploadImage(formDataRequest(file));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejects an executable with a spoofed image extension', async () => {
    const bytes = new Uint8Array(64);
    bytes[0] = 77; bytes[1] = 90;
    const file = makeFile(bytes, 'malware.png', 'image/png');

    const response = await uploadImage(formDataRequest(file));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejects an SVG (executable/dangerous type)', async () => {
    const svgContent = new TextEncoder().encode('<svg onload="alert(1)"/>');
    const file = makeFile(svgContent, 'image.svg', 'image/svg+xml');

    const response = await uploadImage(formDataRequest(file));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejects an HTML file even with a spoofed image content type', async () => {
    const htmlContent = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    const file = makeFile(htmlContent, 'page.html', 'image/png');

    const response = await uploadImage(formDataRequest(file));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejects a file larger than 5 MB', async () => {
    const pngHeader = createPngBytes();
    const largeBytes = new Uint8Array(6 * 1024 * 1024);
    largeBytes.set(pngHeader.subarray(0, 8), 0);
    const largeFile = makeFile(largeBytes, 'big.png', 'image/png');

    const response = await uploadImage(formDataRequest(largeFile));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.message).toContain('5 MB');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejects an empty file', async () => {
    const file = makeFile(new Uint8Array(0), 'empty.png', 'image/png');

    const response = await uploadImage(formDataRequest(file));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('rejects a request without a file field', async () => {
    const form = new FormData();
    const request = new NextRequest('http://localhost/api/templates/upload-image', {
      method: 'POST',
      body: form,
    });

    const response = await uploadImage(request);
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(400);
    expect(body.error?.type).toBe('VALIDATION_ERROR');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    unauthenticated();
    const bytes = createPngBytes();
    const file = makeFile(bytes, 'logo.png', 'image/png');

    const response = await uploadImage(formDataRequest(file));
    const body = (await response.json()) as ApiBody;

    expect(response.status).toBe(401);
    expect(body.error?.type).toBe('AUTHENTICATION_ERROR');
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('generates a server-side safe object key (not using client filename)', async () => {
    const bytes = createPngBytes();
    const file = makeFile(bytes, '../../../etc/passwd.png', 'image/png');

    const response = await uploadImage(formDataRequest(file));
    expect(response.status).toBe(201);

    const uploadCall = mockUpload.mock.calls[0][0];
    expect(uploadCall.key).toMatch(/^templates\/user-1\/[0-9a-f-]{36}\.png$/);
    expect(uploadCall.key).not.toContain('..');
    expect(uploadCall.key).not.toContain('etc');
    expect(uploadCall.key).not.toContain('passwd');
  });

  it('sanitizes the filename stored in the Attachment model', async () => {
    const bytes = createPngBytes();
    const file = makeFile(bytes, 'my/path\\file.png', 'image/png');

    const response = await uploadImage(formDataRequest(file));
    expect(response.status).toBe(201);

    expect(mockPrisma.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filename: expect.not.stringContaining('/'),
        }),
      })
    );
  });

  it('compensates by deleting the B2 object if the DB insert fails', async () => {
    mockPrisma.attachment.create.mockRejectedValueOnce(new Error('DB connection lost'));

    const bytes = createPngBytes();
    const file = makeFile(bytes, 'logo.png', 'image/png');

    const response = await uploadImage(formDataRequest(file));
    expect(response.status).toBe(500);

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('uses B2_PUBLIC_BASE_URL for the returned URL when set', async () => {
    const original = process.env.B2_PUBLIC_BASE_URL;
    process.env.B2_PUBLIC_BASE_URL = 'https://cdn.example.com/file/my-bucket';

    const bytes = createPngBytes();
    const file = makeFile(bytes, 'logo.png', 'image/png');

    const response = await uploadImage(formDataRequest(file));
    const body = (await response.json()) as ApiBody;

    expect(body.data?.url).toMatch(/^https:\/\/cdn\.example\.com\/file\/my-bucket\/templates\/user-1\//);

    process.env.B2_PUBLIC_BASE_URL = original;
  });

  it('derives the URL from B2_ENDPOINT + B2_BUCKET_NAME when B2_PUBLIC_BASE_URL is unset', async () => {
    const originalPublic = process.env.B2_PUBLIC_BASE_URL;
    delete process.env.B2_PUBLIC_BASE_URL;

    const bytes = createPngBytes();
    const file = makeFile(bytes, 'logo.png', 'image/png');

    const response = await uploadImage(formDataRequest(file));
    const body = (await response.json()) as ApiBody;

    expect(body.data?.url).toMatch(/^https:\/\/test-bucket\.s3\.us-west-004\.backblazeb2\.com\/templates\/user-1\//);

    process.env.B2_PUBLIC_BASE_URL = originalPublic;
  });
});
