import { describe, it, expect } from 'vitest';
import { adminUpdateUserSchema, adminSettingsSchema } from '@/lib/validation/admin';

describe('lib/validation/admin', () => {
  describe('adminUpdateUserSchema', () => {
    it('accepts valid input', () => {
      expect(() =>
        adminUpdateUserSchema.parse({
          is_active: true,
          daily_email_limit_override: 50,
        })
      ).not.toThrow();
    });

    it('accepts partial input', () => {
      expect(() => adminUpdateUserSchema.parse({ is_active: false })).not.toThrow();
    });

    it('accepts empty object', () => {
      expect(() => adminUpdateUserSchema.parse({})).not.toThrow();
    });

    it('rejects negative daily_email_limit_override', () => {
      expect(() =>
        adminUpdateUserSchema.parse({
          daily_email_limit_override: -1,
        })
      ).toThrow();
    });

    it('rejects zero daily_email_limit_override', () => {
      expect(() =>
        adminUpdateUserSchema.parse({
          daily_email_limit_override: 0,
        })
      ).toThrow();
    });
  });

  describe('adminSettingsSchema', () => {
    it('accepts valid input', () => {
      expect(() =>
        adminSettingsSchema.parse({
          default_daily_email_limit: 20,
          global_daily_email_limit: 500,
          email_sending_enabled: true,
        })
      ).not.toThrow();
    });

    it('rejects negative limits', () => {
      expect(() =>
        adminSettingsSchema.parse({
          default_daily_email_limit: -1,
          global_daily_email_limit: 500,
          email_sending_enabled: true,
        })
      ).toThrow();
    });

    it('rejects zero limits', () => {
      expect(() =>
        adminSettingsSchema.parse({
          default_daily_email_limit: 0,
          global_daily_email_limit: 500,
          email_sending_enabled: true,
        })
      ).toThrow();
    });
  });
});
