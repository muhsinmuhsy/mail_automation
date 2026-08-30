import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  QuotaError,
  ExternalServiceError,
  buildErrorResponse,
  fromPrismaError,
} from '@/lib/errors';

describe('lib/errors', () => {
  it('AppError carries http status, code and operational flag', () => {
    const err = new AppError('boom', 418, 'TEAPOT', false);
    expect(err.httpStatus).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err.isOperational).toBe(false);
    expect(err).toBeInstanceOf(Error);
  });

  it('subclasses set sensible defaults', () => {
    expect(new ValidationError().httpStatus).toBe(400);
    expect(new AuthenticationError().httpStatus).toBe(401);
    expect(new ForbiddenError().httpStatus).toBe(403);
    expect(new NotFoundError().httpStatus).toBe(404);
    expect(new ConflictError().httpStatus).toBe(409);
    expect(new RateLimitError().httpStatus).toBe(429);
    expect(new QuotaError().httpStatus).toBe(429);
    expect(new ExternalServiceError().httpStatus).toBe(502);
  });

  it('RateLimitError exposes retryAfter in details', () => {
    const err = new RateLimitError('slow down', 30);
    expect(err.details).toEqual({ retryAfterSeconds: 30 });
  });

  it('buildErrorResponse returns a stable client-safe body for AppError', () => {
    const { status, body } = buildErrorResponse(new NotFoundError('missing'));
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('missing');
    expect(typeof body.error.requestId).toBe('string');
  });

  it('buildErrorResponse redacts nothing but wraps unknown errors as 500', () => {
    const { status, body } = buildErrorResponse(new Error('kaboom'));
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('fromPrismaError maps known codes', () => {
    expect(fromPrismaError({ code: 'P2002' })).toBeInstanceOf(ConflictError);
    expect(fromPrismaError({ code: 'P2025' })).toBeInstanceOf(NotFoundError);
    expect(fromPrismaError({})).toBeInstanceOf(AppError);
  });
});
