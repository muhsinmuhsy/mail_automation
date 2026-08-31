import { describe, it, expect } from 'vitest';
import { ERROR_CODES } from '@/lib/errors/error-codes';

describe('lib/errors/error-codes', () => {
  it('exposes a stable code map', () => {
    expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ERROR_CODES.AUTHENTICATION_ERROR).toBe('AUTHENTICATION_ERROR');
    expect(ERROR_CODES.AUTHORIZATION_ERROR).toBe('AUTHORIZATION_ERROR');
    expect(ERROR_CODES.NOT_FOUND).toBe('NOT_FOUND');
    expect(ERROR_CODES.CONFLICT).toBe('CONFLICT');
    expect(ERROR_CODES.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(ERROR_CODES.BUSINESS_ERROR).toBe('BUSINESS_ERROR');
    expect(ERROR_CODES.PROVIDER_ERROR).toBe('PROVIDER_ERROR');
    expect(ERROR_CODES.TEMPORARY_ERROR).toBe('TEMPORARY_ERROR');
    expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });

  it('has self-mapping values', () => {
    for (const [key, value] of Object.entries(ERROR_CODES)) {
      expect(value).toBe(key);
    }
  });
});
