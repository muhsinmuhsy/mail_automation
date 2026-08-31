import { ForbiddenError } from '@/lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function parseOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Cookie-authenticated unsafe requests must come from the same origin. Modern
 * browsers send `Origin` on unsafe methods; `Referer` is accepted as a fallback
 * for older clients. Non-cookie API calls are left to authentication headers.
 */
export function assertSameOriginForCookieMutation(req: Request): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return;
  if (!req.headers.get('cookie')) return;

  const requestOrigin = new URL(req.url).origin;
  const origin = parseOrigin(req.headers.get('origin'));
  const refererOrigin = parseOrigin(req.headers.get('referer'));

  if (origin === requestOrigin || (!origin && refererOrigin === requestOrigin)) {
    return;
  }

  throw new ForbiddenError('Invalid request origin.');
}
