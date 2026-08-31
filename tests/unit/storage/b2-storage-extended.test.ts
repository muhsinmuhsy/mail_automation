import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const store = new Map<string, { body: Uint8Array; contentType: string; contentLength: number; metadata?: Record<string, string>; etag: string }>();
  let mode = 'ok';
  let injected: unknown = null;

  function makeStream(bytes: Uint8Array): ReadableStream {
    return new Response(new Blob([bytes as BlobPart])).body as ReadableStream;
  }

  class FakeS3Client {
    constructor(public config: unknown) {}
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      const name = command.constructor.name;
      const input = command.input;
      const key = input.Key as string;
      if (mode === 'error' && injected) throw injected;

      if (name === 'PutObjectCommand') {
        const body = input.Body as Uint8Array;
        store.set(key, {
          body,
          contentType: input.ContentType as string,
          contentLength: (input.ContentLength as number) ?? body.byteLength,
          metadata: input.Metadata as Record<string, string> | undefined,
          etag: `"${key}-etag"`,
        });
        return { ETag: `"${key}-etag"`, $metadata: { requestId: 'r' } };
      }
      if (name === 'GetObjectCommand') {
        if (mode === 'notFound') throw s3('NoSuchKey', 404);
        if (mode === 'nullBody') return { Body: null };
        const obj = store.get(key);
        if (!obj) throw s3('NoSuchKey', 404);
        return {
          Body: { transformToWebStream: () => makeStream(obj.body) },
          ContentType: obj.contentType,
          ContentLength: obj.contentLength,
          Metadata: obj.metadata ?? {},
          ETag: obj.etag,
        };
      }
      if (name === 'HeadObjectCommand') {
        if (mode === 'notFound') throw s3('NotFound', 404);
        if (mode === 'headSparse') return { ETag: '"e"' };
        const obj = store.get(key);
        if (!obj) throw s3('NotFound', 404);
        return {
          ContentType: obj.contentType,
          ContentLength: obj.contentLength,
          ETag: obj.etag,
          LastModified: new Date('2026-01-01T00:00:00Z'),
        };
      }
      if (name === 'DeleteObjectCommand') {
        if (mode === 'error' && injected) throw injected;
        store.delete(key);
        return {};
      }
      throw new Error(`unexpected command ${name}`);
    }
  }

  function s3(name: string, status: number): Error {
    const e = new Error(name) as Error & { name: string; $metadata: { httpStatusCode: number } };
    e.name = name;
    e.$metadata = { httpStatusCode: status };
    return e;
  }

  return {
    store,
    FakeS3Client,
    getMode: () => mode,
    setMode: (m: string) => {
      mode = m;
    },
    setInjected: (v: unknown) => {
      injected = v;
    },
  };
});

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, S3Client: h.FakeS3Client };
});

import { B2StorageService } from '@/lib/storage/b2/b2.storage';
import { StorageError } from '@/lib/storage/b2/b2.errors';
import type { StorageEnv } from '@/lib/storage/storage.types';

function env(): StorageEnv {
  return {
    B2_BUCKET_NAME: 'test-bucket',
    B2_REGION: 'us-west-004',
    B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
    B2_KEY_ID: 'key-id',
    B2_APPLICATION_KEY: 'secret',
  };
}

describe('B2StorageService (extended)', () => {
  beforeEach(() => {
    h.store.clear();
    h.setMode('ok');
    h.setInjected(null);
  });

  it('uploads with explicit contentLength, metadata and reports eTag/uploadedAt', async () => {
    const svc = B2StorageService.fromEnv(env());
    const res = await svc.upload({
      key: 'resume/u1/a.pdf',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'application/pdf',
      contentLength: 99,
      metadata: { userId: 'u1' },
    });
    expect(res.size).toBe(3);
    expect(res.metadata.contentType).toBe('application/pdf');
    expect(res.metadata.eTag).toBe('"resume/u1/a.pdf-etag"');
    expect(res.metadata.sizeBytes).toBe(3);
    expect(res.metadata.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('uploads from a ReadableStream body', async () => {
    const svc = B2StorageService.fromEnv(env());
    const body = new Response(new Blob([new Uint8Array([5, 6, 7])])).body as ReadableStream;
    const res = await svc.upload({ key: 'k', body, contentType: 'application/pdf' });
    expect(res.size).toBe(3);
  });

  it('maps an unsupported upload body type to a UNKNOWN StorageError', async () => {
    const svc = B2StorageService.fromEnv(env());
    await expect(
      svc.upload({ key: 'k', body: 'nope' as unknown as Uint8Array, contentType: 'application/pdf' }),
    ).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('upload errors are mapped to StorageError', async () => {
    const svc = B2StorageService.fromEnv(env());
    h.setMode('error');
    h.setInjected(Object.assign(new Error('boom'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }));
    await expect(svc.upload({ key: 'k', body: new Uint8Array([1]), contentType: 'application/pdf' })).rejects.toBeInstanceOf(
      StorageError,
    );
  });

  it('download returns null when the object Body is null', async () => {
    const svc = B2StorageService.fromEnv(env());
    h.setMode('nullBody');
    expect(await svc.download('k')).toBeNull();
  });

  it('download maps a non-NOT_FOUND error to a thrown StorageError', async () => {
    const svc = B2StorageService.fromEnv(env());
    h.setMode('error');
    h.setInjected(Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }));
    await expect(svc.download('missing')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('delete maps errors to a thrown StorageError', async () => {
    const svc = B2StorageService.fromEnv(env());
    h.setMode('error');
    h.setInjected(Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }));
    await expect(svc.delete('k')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('exists returns true for an uploaded object and false otherwise', async () => {
    const svc = B2StorageService.fromEnv(env());
    await svc.upload({ key: 'k', body: new Uint8Array([1]), contentType: 'application/pdf' });
    expect(await svc.exists('k')).toBe(true);
    expect(await svc.exists('nope')).toBe(false);
  });

  it('getMetadata returns parsed metadata', async () => {
    const svc = B2StorageService.fromEnv(env());
    await svc.upload({
      key: 'k',
      body: new Uint8Array([1, 2, 3, 4]),
      contentType: 'application/pdf',
      metadata: { userId: 'u1' },
    });
    const meta = await svc.getMetadata('k');
    expect(meta).not.toBeNull();
    expect(meta!.sizeBytes).toBe(4);
    expect(meta!.contentType).toBe('application/pdf');
    expect(meta!.eTag).toBe('"k-etag"');
    expect(meta!.uploadedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('getMetadata returns null for a missing object', async () => {
    const svc = B2StorageService.fromEnv(env());
    h.setMode('notFound');
    expect(await svc.getMetadata('missing')).toBeNull();
  });

  it('getMetadata applies default content type / size when absent', async () => {
    const svc = B2StorageService.fromEnv(env());
    h.setMode('headSparse');
    h.store.set('k', { body: new Uint8Array([1]), contentType: 'application/pdf', contentLength: 1, etag: 'e' });
    const meta = await svc.getMetadata('k');
    expect(meta).not.toBeNull();
    expect(meta!.sizeBytes).toBe(0);
    expect(meta!.contentType).toBe('application/octet-stream');
    expect(meta!.uploadedAt).toBeUndefined();
  });

  it('getMetadata maps a non-NOT_FOUND error to a thrown StorageError', async () => {
    const svc = B2StorageService.fromEnv(env());
    h.setMode('error');
    h.setInjected(Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }));
    await expect(svc.getMetadata('k')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
