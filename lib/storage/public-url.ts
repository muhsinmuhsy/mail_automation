/**
 * Construct a stable public HTTPS URL for a B2 object key.
 *
 * See docs/TEMPLATICAL_EMAIL_BUILDER.md §12. Email images must use stable
 * public URLs (not expiring signed URLs) so emails sent weeks/months later
 * still render.
 *
 * Priority:
 * 1. `B2_PUBLIC_BASE_URL` env var — explicit public base URL (e.g. a CDN or
 *    B2 friendly URL like `https://f000.backblazeb2.com/file/my-bucket`).
 * 2. Derived from `B2_ENDPOINT` + `B2_BUCKET_NAME` — virtual-hosted style:
 *    `https://<bucket>.<endpoint-host>/<key>`.
 */
export function buildPublicUrl(
  key: string,
  env: Record<string, string | undefined> = process.env
): string {
  const explicit = env.B2_PUBLIC_BASE_URL;
  if (explicit) {
    const base = explicit.replace(/\/+$/, '');
    return `${base}/${key}`;
  }

  const endpoint = env.B2_ENDPOINT ?? '';
  const bucket = env.B2_BUCKET_NAME ?? '';

  if (!endpoint || !bucket) {
    throw new Error(
      'Cannot construct public URL: set B2_PUBLIC_BASE_URL or both B2_ENDPOINT and B2_BUCKET_NAME.'
    );
  }

  const host = endpoint.replace(/^https?:\/\//, '');
  return `https://${bucket}.${host}/${key}`;
}
