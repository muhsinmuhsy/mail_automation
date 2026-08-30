import { S3Client } from '@aws-sdk/client-s3';
import type { StorageEnv } from '../storage.types';

export function createB2Client(env: Pick<StorageEnv, 'B2_ENDPOINT' | 'B2_REGION' | 'B2_KEY_ID' | 'B2_APPLICATION_KEY'>): S3Client {
  const endpoint = env.B2_ENDPOINT;
  const region = env.B2_REGION;
  const accessKeyId = env.B2_KEY_ID;
  const secretAccessKey = env.B2_APPLICATION_KEY;

  if (!endpoint || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing Backblaze B2 configuration. Ensure B2_ENDPOINT, B2_REGION, B2_KEY_ID and B2_APPLICATION_KEY are set.',
    );
  }

  return new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: false,
  });
}
