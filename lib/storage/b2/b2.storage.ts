import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type {
  ObjectMetadata,
  StorageEnv,
  StorageService,
  StoredObject,
  UploadInput,
} from '../storage.types';
import { createB2Client } from './b2.client';
import { mapB2Error } from './b2.errors';

async function toUint8Array(body: UploadInput['body']): Promise<Uint8Array> {
  if (body instanceof Uint8Array) {
    return body;
  }
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return merged;
  }
  throw new Error('Unsupported upload body type.');
}

export class B2StorageService implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(client: S3Client, bucket: string) {
    this.client = client;
    this.bucket = bucket;
  }

  static fromEnv(env: StorageEnv): B2StorageService {
    return new B2StorageService(createB2Client(env), env.B2_BUCKET_NAME);
  }

  async upload(input: UploadInput): Promise<StoredObject> {
    try {
      const data = await toUint8Array(input.body);
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: data,
        ContentType: input.contentType,
        ContentLength: input.contentLength ?? data.byteLength,
        Metadata: input.metadata,
      });
      const response = await this.client.send(command);
      return {
        key: input.key,
        size: data.byteLength,
        contentType: input.contentType,
        metadata: {
          key: input.key,
          sizeBytes: data.byteLength,
          contentType: input.contentType,
          eTag: response.ETag,
          uploadedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      throw mapB2Error(error, `upload:${input.key}`);
    }
  }

  async download(key: string): Promise<ReadableStream | null> {
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      const response = await this.client.send(command);
      if (!response.Body) {
        return null;
      }
      return response.Body.transformToWebStream() as ReadableStream;
    } catch (error) {
      if (mapB2Error(error, `download:${key}`).code === 'NOT_FOUND') {
        return null;
      }
      throw mapB2Error(error, `download:${key}`);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({ Bucket: this.bucket, Key: key });
      await this.client.send(command);
    } catch (error) {
      throw mapB2Error(error, `delete:${key}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const metadata = await this.getMetadata(key);
    return metadata !== null;
  }

  async getMetadata(key: string): Promise<ObjectMetadata | null> {
    try {
      const command = new HeadObjectCommand({ Bucket: this.bucket, Key: key });
      const response = await this.client.send(command);
      return {
        key,
        sizeBytes: response.ContentLength ?? 0,
        contentType: response.ContentType ?? 'application/octet-stream',
        eTag: response.ETag,
        uploadedAt: response.LastModified?.toISOString(),
      };
    } catch (error) {
      if (mapB2Error(error, `getMetadata:${key}`).code === 'NOT_FOUND') {
        return null;
      }
      throw mapB2Error(error, `getMetadata:${key}`);
    }
  }
}
