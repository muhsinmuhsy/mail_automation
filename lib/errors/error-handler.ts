import { ErrorCode } from './error-codes';
import { AppError } from './index';

export interface ApiErrorResponse {
  type: ErrorCode;
  message: string;
  requestId?: string;
  fields?: Record<string, string>;
  retryAfter?: number;
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiFailureResponse {
  success: false;
  error: ApiErrorResponse;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiFailureResponse;

export function success<T>(data: T, message?: string): ApiSuccessResponse<T> {
  return { success: true, data, message };
}

export function failure(
  type: ErrorCode,
  message: string,
  options?: { fields?: Record<string, string>; retryAfter?: number; requestId?: string }
): ApiFailureResponse {
  return {
    success: false,
    error: {
      type,
      message,
      ...options,
    },
  };
}

const APP_ERROR_CODE_MAP: Record<string, ErrorCode> = {
  UNAUTHENTICATED: 'AUTHENTICATION_ERROR',
  FORBIDDEN: 'AUTHORIZATION_ERROR',
  QUOTA_EXCEEDED: 'RATE_LIMITED',
  EXTERNAL_SERVICE_ERROR: 'PROVIDER_ERROR',
  CONFIGURATION_ERROR: 'INTERNAL_ERROR',
};

/**
 * Maps an `AppError` (or any thrown value) into the standard `{success,error}`
 * failure envelope, preserving the machine-readable `code` as `error.type` and
 * attaching a `requestId`. Unknown errors become a generic 500.
 */
export function fromAppError(err: unknown): { status: number; body: ApiFailureResponse } {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `req_${Date.now()}`;
  if (err instanceof AppError) {
    const type = APP_ERROR_CODE_MAP[err.code] ?? (err.code as ErrorCode);
    const options: { fields?: Record<string, string>; retryAfter?: number; requestId: string } = {
      requestId,
    };
    if (err.details && typeof err.details === 'object' && 'fields' in err.details) {
      options.fields = (err.details as { fields: Record<string, string> }).fields;
    }
    if (err.details && typeof err.details === 'object' && 'retryAfterSeconds' in err.details) {
      options.retryAfter = (err.details as { retryAfterSeconds: number }).retryAfterSeconds;
    }
    return { status: err.httpStatus, body: failure(type, err.message, options) };
  }
  return {
    status: 500,
    body: failure('INTERNAL_ERROR', 'An unexpected error occurred.', { requestId }),
  };
}
