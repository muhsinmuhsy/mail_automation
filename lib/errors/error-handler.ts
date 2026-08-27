import { ErrorCode } from './error-codes';

export interface ApiErrorResponse {
  type: ErrorCode;
  message: string;
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
  options?: { fields?: Record<string, string>; retryAfter?: number }
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
