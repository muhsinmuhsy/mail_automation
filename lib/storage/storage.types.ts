export interface UploadInput {
  key: string;
  body: ReadableStream | Buffer | Uint8Array;
  contentType: string;
  contentLength?: number;
  metadata?: Record<string, string>;
}

export interface ObjectMetadata {
  key: string;
  sizeBytes: number;
  contentType: string;
  eTag?: string;
  uploadedAt?: string;
}

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
  metadata: ObjectMetadata;
}

export interface StorageService {
  upload(input: UploadInput): Promise<StoredObject>;
  download(key: string): Promise<ReadableStream | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<ObjectMetadata | null>;
}

export interface StorageEnv {
  B2_BUCKET_NAME: string;
  B2_REGION: string;
  B2_ENDPOINT: string;
  B2_KEY_ID: string;
  B2_APPLICATION_KEY: string;
}

export function isStorageEnv(value: unknown): value is StorageEnv {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.B2_BUCKET_NAME === 'string' &&
    typeof candidate.B2_REGION === 'string' &&
    typeof candidate.B2_ENDPOINT === 'string' &&
    typeof candidate.B2_KEY_ID === 'string' &&
    typeof candidate.B2_APPLICATION_KEY === 'string'
  );
}
