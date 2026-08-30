import { B2StorageService } from './b2/b2.storage';
import type { StorageEnv, StorageService } from './storage.types';

/**
 * Resolve the configured storage implementation. The application depends only
 * on the `StorageService` interface; Backblaze B2 (S3-Compatible API) is the
 * only implemented provider for MVP. Swap implementations here without
 * touching callers.
 */
export function createStorageService(env: Partial<StorageEnv> | Record<string, unknown>): StorageService {
  const candidate: StorageEnv = {
    B2_BUCKET_NAME: String(env.B2_BUCKET_NAME ?? ''),
    B2_REGION: String(env.B2_REGION ?? ''),
    B2_ENDPOINT: String(env.B2_ENDPOINT ?? ''),
    B2_KEY_ID: String(env.B2_KEY_ID ?? ''),
    B2_APPLICATION_KEY: String(env.B2_APPLICATION_KEY ?? ''),
  };

  // Future providers (R2, S3, etc.) would be selected here based on config.
  return B2StorageService.fromEnv(candidate);
}
