import { describe, it, expect } from 'vitest';
import { success, failure } from '@/lib/errors/error-handler';

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
  });
});
