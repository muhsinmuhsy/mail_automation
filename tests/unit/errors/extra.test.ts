import { describe, it, expect } from 'vitest';
import {
  AppError,
  ExternalServiceError,
  ConfigurationError,
  buildErrorResponse,
  fromPrismaError,
} from '@/lib/errors';
import { fromAppError } from '@/lib/errors/error-handler';

describe('lib/errors (remaining branches)', () => {
  describe('buildErrorResponse', () => {
    it('passes through details for an AppError', () => {
      const { status, body } = buildErrorResponse(new AppError('bad', 400, 'VALIDATION_ERROR', true, { fields: { email: 'required' } }));
      expect(status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details).toEqual({ fields: { email: 'required' } });
    });

    it('logs an error (not warn) for non-operational errors and includes details', () => {
      const { status, body } = buildErrorResponse(
        new AppError('boom', 500, 'INTERNAL_ERROR', false, { trace: 1 }),
      );
      expect(status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.details).toEqual({ trace: 1 });
    });

    it('coerces a non-Error thrown value into a generic 500', () => {
      const { status, body } = buildErrorResponse('a string');
      expect(status).toBe(500);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('An unexpected error occurred.');
    });

    it('fromPrismaError returns a generic AppError for unknown codes', () => {
      const err = fromPrismaError({ code: 'P9999', message: 'weird' });
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('DATABASE_ERROR');
      expect(err.httpStatus).toBe(500);
    });
  });

  describe('fromAppError extra mappings', () => {
    it('maps EXTERNAL_SERVICE_ERROR to PROVIDER_ERROR', () => {
      expect(fromAppError(new ExternalServiceError()).body.error.type).toBe('PROVIDER_ERROR');
    });

    it('maps CONFIGURATION_ERROR to INTERNAL_ERROR', () => {
      expect(fromAppError(new ConfigurationError()).body.error.type).toBe('INTERNAL_ERROR');
    });

    it('extracts fields from details', () => {
      const err = new AppError('invalid', 400, 'VALIDATION_ERROR', true, { fields: { name: 'bad' } });
      const body = fromAppError(err).body;
      expect(body.error.fields).toEqual({ name: 'bad' });
    });

    it('extracts retryAfter from details', () => {
      const err = new AppError('slow', 429, 'RATE_LIMITED', true, { retryAfterSeconds: 12 });
      const body = fromAppError(err).body;
      expect(body.error.retryAfter).toBe(12);
    });

    it('passes a provided requestId through', () => {
      const err = new AppError('x', 400, 'VALIDATION_ERROR', true, { fields: {} });
      const body = fromAppError(err).body;
      expect(body.error.requestId).toBeTruthy();
    });

    it('coerces unknown errors into a generic 500', () => {
      const { status, body } = fromAppError(new Error('boom'));
      expect(status).toBe(500);
      expect(body.error.type).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('An unexpected error occurred.');
      expect(body.error.requestId).toBeTruthy();
    });
  });
});
