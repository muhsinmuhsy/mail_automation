import { logger } from '../logging/logger';

/**
 * Application error hierarchy.
 *
 * Every error that can reach an API response should be an `AppError` so the
 * route layer can translate it into a stable, client-safe JSON body. The
 * `code` field is a stable machine identifier (safe to branch on client-side);
 * the `details` field may contain structured validation errors.
 */

export type ErrorBody = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
};

export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  readonly isOperational: boolean;
  readonly details?: unknown;

  constructor(
    message: string,
    httpStatus = 500,
    code = 'INTERNAL_ERROR',
    isOperational = true,
    details?: unknown
  ) {
    super(message);
    this.name = new.target.name;
    this.httpStatus = httpStatus;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed.', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required.', details?: unknown) {
    super(message, 401, 'UNAUTHENTICATED', true, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.', details?: unknown) {
    super(message, 403, 'FORBIDDEN', true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.', details?: unknown) {
    super(message, 404, 'NOT_FOUND', true, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'The resource already exists or conflicts.', details?: unknown) {
    super(message, 409, 'CONFLICT', true, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please slow down.', retryAfterSeconds?: number) {
    super(
      message,
      429,
      'RATE_LIMITED',
      true,
      retryAfterSeconds !== undefined ? { retryAfterSeconds } : undefined
    );
  }
}

export class QuotaError extends AppError {
  constructor(message = 'Daily email quota reached.', details?: unknown) {
    super(message, 429, 'QUOTA_EXCEEDED', true, details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message = 'Upstream service error.', details?: unknown) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', true, details);
  }
}

export class ConfigurationError extends AppError {
  constructor(message = 'Service is misconfigured.', details?: unknown) {
    super(message, 500, 'CONFIGURATION_ERROR', false, details);
  }
}

function generateRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Translate any thrown value into a stable error body and emit a structured
 * log line. Non-operational errors are logged with full detail; operational
 * errors are logged at warn level with the client-safe message only.
 */
export function buildErrorResponse(err: unknown): {
  status: number;
  body: ErrorBody;
} {
  const requestId = generateRequestId();

  if (err instanceof AppError) {
    if (err.isOperational) {
      logger.warn(`handled error: ${err.code}`, {
        code: err.code,
        message: err.message,
        requestId,
        details: err.details,
      });
    } else {
      logger.error(`unexpected error: ${err.code}`, {
        code: err.code,
        message: err.message,
        requestId,
        stack: err.stack,
        details: err.details,
      });
    }

    return {
      status: err.httpStatus,
      body: {
        error: {
          code: err.code,
          message: err.message,
          requestId,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
    };
  }

  logger.error('unhandled exception', {
    requestId,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
      },
    },
  };
}

/** Re-throw a Prisma known error as the appropriate AppError. */
export function fromPrismaError(err: unknown): AppError {
  const code = (err as { code?: string })?.code;
  if (code === 'P2002') {
    return new ConflictError('A record with the same unique value already exists.', err);
  }
  if (code === 'P2025') {
    return new NotFoundError('The requested resource was not found.', err);
  }
  return new AppError('Database error.', 500, 'DATABASE_ERROR', true, err);
}
