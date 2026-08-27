export async function uploadResume(bucket: R2Bucket, key: string, content: ArrayBuffer): Promise<string> {
  await bucket.put(key, content);
  return key;
}

export async function deleteResume(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

export async function getResume(bucket: R2Bucket, key: string): Promise<ArrayBuffer | null> {
  const object = await bucket.get(key);
  if (!object) {
    return null;
  }
  return object.arrayBuffer();
}
