import { describe, it, expect } from 'vitest';
import { createEmailAccountSchema } from '@/lib/validation/email-account';

describe('lib/validation/email-account', () => {
  describe('createEmailAccountSchema', () => {
    it('accepts valid input', () => {
      const result = createEmailAccountSchema.safeParse({
        provider: 'gmail',
        email: 'test@gmail.com',
        auth_method: 'app_password',
        secret: 'my-secret',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const result = createEmailAccountSchema.safeParse({
        provider: 'gmail',
        email: 'invalid-email',
        auth_method: 'app_password',
        secret: 'my-secret',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid provider', () => {
      const result = createEmailAccountSchema.safeParse({
        provider: 'invalid',
        email: 'test@gmail.com',
        auth_method: 'app_password',
        secret: 'my-secret',
      });
      expect(result.success).toBe(false);
    });
  });
});
