import { describe, it, expect } from 'vitest';
import { createEmailAccountSchema, testEmailAccountSchema } from '@/lib/validation/email-account';

describe('lib/validation/email-account', () => {
  describe('createEmailAccountSchema', () => {
    it('accepts valid input', () => {
      expect(() =>
        createEmailAccountSchema.parse({
          provider: 'gmail',
          email: 'test@example.com',
          auth_method: 'app_password',
          secret: 'my-secret',
        })
      ).not.toThrow();
    });

    it('rejects invalid provider', () => {
      expect(() =>
        createEmailAccountSchema.parse({
          provider: 'invalid',
          email: 'test@example.com',
          auth_method: 'app_password',
          secret: 'my-secret',
        })
      ).toThrow();
    });

    it('rejects invalid email', () => {
      expect(() =>
        createEmailAccountSchema.parse({
          provider: 'gmail',
          email: 'not-an-email',
          auth_method: 'app_password',
          secret: 'my-secret',
        })
      ).toThrow();
    });

    it('rejects invalid auth_method', () => {
      expect(() =>
        createEmailAccountSchema.parse({
          provider: 'gmail',
          email: 'test@example.com',
          auth_method: 'invalid',
          secret: 'my-secret',
        })
      ).toThrow();
    });

    it('rejects empty secret', () => {
      expect(() =>
        createEmailAccountSchema.parse({
          provider: 'gmail',
          email: 'test@example.com',
          auth_method: 'app_password',
          secret: '',
        })
      ).toThrow();
    });
  });

  describe('testEmailAccountSchema', () => {
    it('accepts valid input', () => {
      expect(() => testEmailAccountSchema.parse({ secret: 'my-secret' })).not.toThrow();
    });

    it('rejects empty secret', () => {
      expect(() => testEmailAccountSchema.parse({ secret: '' })).toThrow();
    });
  });
});
