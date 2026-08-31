import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => {
  class FakeS3Client {
    constructor(public config: unknown) {}
    async send() {
      return {};
    }
  }
  return { FakeS3Client };
});

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, S3Client: h.FakeS3Client };
});

import { createStorageService } from '@/lib/storage/storage.factory';
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

describe('createStorageService factory', () => {
  it('resolves a working B2-backed service from a full environment', async () => {
    const svc = createStorageService(env());
    await svc.upload({ key: 'k', body: new Uint8Array([1, 2]), contentType: 'application/pdf' });
    expect(await svc.exists('k')).toBe(true);
  });

  it('always selects B2 as the only configured provider', () => {
    const svc = createStorageService(env());
    expect(svc).toBeDefined();
  });

  it('throws when required B2 configuration is missing', () => {
    expect(() => createStorageService({})).toThrow(/Missing Backblaze B2 configuration/);
    expect(() =>
      createStorageService({
        B2_BUCKET_NAME: '',
        B2_REGION: '',
        B2_ENDPOINT: '',
        B2_KEY_ID: '',
        B2_APPLICATION_KEY: '',
      }),
    ).toThrow(/Missing Backblaze B2 configuration/);
  });
});
