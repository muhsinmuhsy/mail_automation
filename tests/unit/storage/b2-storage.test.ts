import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FakeObject {
  body: Uint8Array;
  contentType: string;
  contentLength: number;
  metadata?: Record<string, string>;
  etag: string;
}

const h = vi.hoisted(() => {
  const store = new Map<string, FakeObject>();

  function makeStream(bytes: Uint8Array): ReadableStream {
    return new Response(new Blob([bytes as BlobPart])).body as ReadableStream;
  }

  class FakeS3Client {
    constructor(public config: unknown) {}
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      const name = command.constructor.name;
      const input = command.input as Record<string, unknown>;
      const key = input.Key as string;
      if (name === 'PutObjectCommand') {
        const body = input.Body as Uint8Array;
        store.set(key, {
          body,
          contentType: input.ContentType as string,
          contentLength: body.byteLength,
          metadata: input.Metadata as Record<string, string> | undefined,
          etag: `"${key}-etag"`,
        });
        return { ETag: `"${key}-etag"`, $metadata: { requestId: 'req-1' } };
      }
      if (name === 'GetObjectCommand') {
        const obj = store.get(key);
        if (!obj) {
          const err = Object.assign(new Error('NoSuchKey'), {
            name: 'NoSuchKey',
            $metadata: { httpStatusCode: 404 },
          });
          throw err;
        }
        return {
          Body: {
            transformToWebStream: () => makeStream(obj.body),
          },
          ContentType: obj.contentType,
          ContentLength: obj.contentLength,
          Metadata: obj.metadata ?? {},
          ETag: obj.etag,
        };
      }
      if (name === 'HeadObjectCommand') {
        const obj = store.get(key);
        if (!obj) {
          const err = Object.assign(new Error('NotFound'), {
            name: 'NotFound',
            $metadata: { httpStatusCode: 404 },
          });
          throw err;
        }
        return {
          ContentType: obj.contentType,
          ContentLength: obj.contentLength,
          ETag: obj.etag,
          LastModified: new Date('2026-01-01T00:00:00Z'),
        };
      }
      if (name === 'DeleteObjectCommand') {
        store.delete(key);
        return {};
      }
      throw new Error(`unexpected command ${name}`);
    }
  }

  return { store, FakeS3Client };
});

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    S3Client: h.FakeS3Client,
  };
});

const store = h.store;

import { B2StorageService } from '@/lib/storage/b2/b2.storage';
import { createStorageService } from '@/lib/storage/storage.factory';
import { mapB2Error, StorageError } from '@/lib/storage/b2/b2.errors';
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

describe('B2StorageService', () => {
  beforeEach(() => store.clear());

  it('uploads and returns a stored object', async () => {
    const svc = B2StorageService.fromEnv(env());
    const result = await svc.upload({
      key: 'resume/user-1/abc.pdf',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'application/pdf',
    });
    expect(result.key).toBe('resume/user-1/abc.pdf');
    expect(result.size).toBe(3);
    expect(result.contentType).toBe('application/pdf');
  });

  it('records an ISO timestamp in uploadedAt metadata', async () => {
    const svc = B2StorageService.fromEnv(env());
    const result = await svc.upload({
      key: 'k',
      body: new Uint8Array([1]),
      contentType: 'application/pdf',
    });
    expect(result.metadata.uploadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('generates a storage key deterministically from input (upload validation)', async () => {
    const svc = B2StorageService.fromEnv(env());
    const result = await svc.upload({
      key: 'resume/user-1/abc.pdf',
      body: new Uint8Array([9]),
      contentType: 'application/pdf',
    });
    expect(result.key).toMatch(/^resume\/user-1\//);
  });

  it('downloads an uploaded object as a ReadableStream', async () => {
    const svc = B2StorageService.fromEnv(env());
    await svc.upload({ key: 'k', body: new Uint8Array([7, 8]), contentType: 'application/pdf' });
    const stream = await svc.download('k');
    expect(stream).not.toBeNull();
    const buf = await new Response(stream).arrayBuffer();
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([7, 8]));
  });

  it('throws NOT_FOUND when downloading a missing object', async () => {
    const svc = B2StorageService.fromEnv(env());
    await expect(svc.download('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns false from exists for a missing object', async () => {
    const svc = B2StorageService.fromEnv(env());
    expect(await svc.exists('missing')).toBe(false);
  });

  it('returns true from exists for an existing object', async () => {
    const svc = B2StorageService.fromEnv(env());
    await svc.upload({ key: 'k', body: new Uint8Array([1]), contentType: 'application/pdf' });
    expect(await svc.exists('k')).toBe(true);
  });

  it('returns metadata for an existing object', async () => {
    const svc = B2StorageService.fromEnv(env());
    await svc.upload({
      key: 'k',
      body: new Uint8Array([1, 2, 3, 4]),
      contentType: 'application/pdf',
      metadata: { userId: 'user-1' },
    });
    const meta = await svc.getMetadata('k');
    expect(meta).not.toBeNull();
    expect(meta.sizeBytes).toBe(4);
    expect(meta.contentType).toBe('application/pdf');
  });

  it('throws NOT_FOUND when reading metadata for a missing object', async () => {
    const svc = B2StorageService.fromEnv(env());
    await expect(svc.getMetadata('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('deletes an object and makes it unavailable', async () => {
    const svc = B2StorageService.fromEnv(env());
    await svc.upload({ key: 'k', body: new Uint8Array([1]), contentType: 'application/pdf' });
    await svc.delete('k');
    expect(await svc.exists('k')).toBe(false);
    await expect(svc.download('k')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('maps NoSuchKey to NOT_FOUND', () => {
    const err = new Error('x');
    (err as { name: string }).name = 'NoSuchKey';
    const mapped = mapB2Error(err);
    expect(mapped).toBeInstanceOf(StorageError);
    expect(mapped.code).toBe('NOT_FOUND');
  });

  it('maps timeout errors to TIMEOUT', () => {
    const err = new Error('connection timed out');
    const mapped = mapB2Error(err);
    expect(mapped.code).toBe('TIMEOUT');
  });
});

describe('createStorageService factory', () => {
  beforeEach(() => store.clear());

  it('returns a B2-backed storage service', async () => {
    const svc = createStorageService(env());
    await svc.upload({ key: 'k', body: new Uint8Array([1]), contentType: 'application/pdf' });
    expect(await svc.exists('k')).toBe(true);
  });
});
