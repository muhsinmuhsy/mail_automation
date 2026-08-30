import { NextResponse } from 'next/server';
import { fromAppError, success, type ApiSuccessResponse } from '@/lib/errors/error-handler';

/**
 * Shared API response helpers. They guarantee a stable envelope, attach a
 * `X-Request-ID` to every response, and set a `Retry-After` header on
 * rate-limit (429) errors so clients can back off correctly.
 */

export function respondOk<T>(data: T, requestId: string, message?: string, status = 200): NextResponse {
  const headers: Record<string, string> = { 'X-Request-ID': requestId };
  return NextResponse.json(success(data, message), { status, headers });
}

export function respondError(err: unknown, requestId?: string): NextResponse {
  const requestIdVal = requestId ?? globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}`;
  const { status, body } = fromAppError(err);
  const headers: Record<string, string> = { 'X-Request-ID': requestIdVal };
  if (body.error.retryAfter !== undefined) {
    headers['Retry-After'] = String(body.error.retryAfter);
  }
  return NextResponse.json(body, { status, headers });
}

/**
 * Paginated list response. Keeps the same `{success, data}` envelope as
 * `respondOk` and adds a `pagination` metadata block. `data` remains the
 * array of items so callers can treat list and single responses uniformly.
 */
export function respondList<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  requestId: string,
  message?: string
): NextResponse {
  const headers: Record<string, string> = { 'X-Request-ID': requestId };
  return NextResponse.json(
    {
      success: true,
      data: items,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      ...(message ? { message } : {}),
    },
    { status: 200, headers }
  );
}

export type { ApiSuccessResponse };
