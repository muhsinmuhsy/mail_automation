import { describe, it, expect } from 'vitest';
import { success, failure, fromAppError } from '@/lib/errors/error-handler';
import {
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  QuotaError,
  RateLimitError,
} from '@/lib/errors';

describe('lib/errors/error-handler', () => {
  describe('success', () => {
    it('returns correct shape', () => {
      const result = success({ id: '1' }, 'Created');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: '1' });
      expect(result.message).toBe('Created');
    });
  });

  describe('failure', () => {
    it('returns correct shape', () => {
      const result = failure('VALIDATION_ERROR', 'Invalid input', { fields: { email: 'Required' } });
      expect(result.success).toBe(false);
      expect(result.error.type).toBe('VALIDATION_ERROR');
      expect(result.error.message).toBe('Invalid input');
      expect(result.error.fields).toEqual({ email: 'Required' });
    });

    it('passes through requestId', () => {
      const result = failure('NOT_FOUND', 'nope', { requestId: 'req_1' });
      expect(result.error.requestId).toBe('req_1');
    });
  });

  describe('fromAppError', () => {
    it('maps an AppError into the failure envelope with a requestId', () => {
      const { status, body } = fromAppError(new ValidationError('bad'));
      expect(status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.type).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('bad');
      expect(body.error.requestId).toBeTruthy();
    });

    it('maps UNAUTHENTICATED to AUTHENTICATION_ERROR and FORBIDDEN to AUTHORIZATION_ERROR', () => {
      expect(fromAppError(new AuthenticationError()).body.error.type).toBe('AUTHENTICATION_ERROR');
      expect(fromAppError(new ForbiddenError()).body.error.type).toBe('AUTHORIZATION_ERROR');
    });

    it('maps QUOTA_EXCEEDED to RATE_LIMITED', () => {
      expect(fromAppError(new QuotaError()).body.error.type).toBe('RATE_LIMITED');
    });

    it('exposes retryAfter for a RateLimitError', () => {
      const { status, body } = fromAppError(new RateLimitError('slow', 30));
      expect(status).toBe(429);
      expect(body.error.retryAfter).toBe(30);
    });

    it('coerces unknown errors into a generic 500', () => {
      const { status, body } = fromAppError(new Error('boom'));
      expect(status).toBe(500);
      expect(body.error.type).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('An unexpected error occurred.');
    });
  });
});
