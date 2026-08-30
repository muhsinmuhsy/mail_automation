import type { S3ServiceException } from '@aws-sdk/client-s3';

export type StorageErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'TIMEOUT'
  | 'INVALID_INPUT'
  | 'UNKNOWN';

export class StorageError extends Error {
  public readonly code: StorageErrorCode;
  public readonly cause?: unknown;

  constructor(code: StorageErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.cause = cause;
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const name = error.name;
  const text = `${error.message} ${String((error as { code?: unknown }).code ?? '')}`.toLowerCase();
  return (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('econnreset') ||
    text.includes('econnrefused')
  );
}

export function mapB2Error(error: unknown, context?: string): StorageError {
  if (error instanceof StorageError) {
    return error;
  }

  if (isTimeoutError(error)) {
    return new StorageError('TIMEOUT', `Storage operation timed out.${context ? ` (${context})` : ''}`, error);
  }

  if (error instanceof Error && error.name === 'NoSuchKey') {
    return new StorageError('NOT_FOUND', `Object not found.${context ? ` (${context})` : ''}`, error);
  }

  if (isS3ServiceException(error)) {
    const status = error.$metadata?.httpStatusCode;
    if (status === 404 || error.name === 'NotFound' || error.name === 'NoSuchKey') {
      return new StorageError('NOT_FOUND', `Object not found.${context ? ` (${context})` : ''}`, error);
    }
    if (status === 403 || status === 400 || error.name === 'AccessDenied') {
      return new StorageError('FORBIDDEN', `Storage access denied.${context ? ` (${context})` : ''}`, error);
    }
    return new StorageError(
      'UNKNOWN',
      `Storage operation failed: ${error.name}.${context ? ` (${context})` : ''}`,
      error,
    );
  }

  return new StorageError(
    'UNKNOWN',
    `Unexpected storage error.${context ? ` (${context})` : ''}`,
    error,
  );
}

function isS3ServiceException(error: unknown): error is S3ServiceException {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    'name' in error
  );
}
