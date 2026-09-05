import { describe, it, expect } from 'vitest';
import { ValidationError } from '@/lib/errors';
import {
  validate,
  readJson,
  emailSchema,
  contactSchema,
  templateSchema,
  emailAccountSchema,
  campaignSchema,
  attachmentUploadSchema,
  systemSettingsSchema,
  paginationSchema,
} from '@/lib/validation/index';

describe('lib/validation/index', () => {
  describe('validate', () => {
    it('returns parsed data on success', () => {
      expect(validate(emailSchema, 'a@b.com')).toBe('a@b.com');
    });

    it('throws a ValidationError carrying flattened details on failure', () => {
      let caught: unknown;
      try {
        validate(emailSchema, 'not-an-email');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ValidationError);
      const ve = caught as ValidationError;
      expect(ve.code).toBe('VALIDATION_ERROR');
      expect(ve.details).toBeDefined();
    });
  });

  describe('readJson', () => {
    it('parses a valid JSON request body', async () => {
      const req = new Request('http://x.test', { method: 'POST', body: JSON.stringify({ a: 1 }) });
      expect(await readJson(req)).toEqual({ a: 1 });
    });

    it('throws a ValidationError on invalid JSON', async () => {
      const req = new Request('http://x.test', { method: 'POST', body: 'not json{{' });
      await expect(readJson(req)).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('aggregate schemas', () => {
    it('contactSchema accepts valid and rejects invalid', () => {
      expect(() => contactSchema.parse({ name: 'n', email: 'a@b.com' })).not.toThrow();
      expect(() => contactSchema.parse({ name: '', email: 'bad' })).toThrow();
    });

    it('templateSchema enforces required fields', () => {
      expect(() => templateSchema.parse({ name: 'n', subject: 's', body: 'b' })).not.toThrow();
      expect(() => templateSchema.parse({ name: '', subject: '', body: '' })).toThrow();
    });

    it('emailAccountSchema validates provider and auth method', () => {
      expect(
        emailAccountSchema.parse({ provider: 'gmail', email: 'a@b.com', auth_method: 'app_password' }),
      ).toBeDefined();
      expect(() => emailAccountSchema.parse({ provider: 'nope', email: 'a@b.com', auth_method: 'app_password' })).toThrow();
    });

    it('campaignSchema validates nested uuid arrays and bounds', () => {
      const id = crypto.randomUUID();
      expect(
        campaignSchema.parse({
          name: 'n',
          email_account_id: id,
          attachment_id: id,
          template_id: id,
          contact_ids: [id],
          start_at: '2026-01-01T00:00:00Z',
          interval_minutes: 5,
        }),
      ).toBeDefined();
      expect(() =>
        campaignSchema.parse({
          name: 'n',
          email_account_id: 'bad',
          resume_id: 'bad',
          template_id: 'bad',
          contact_ids: [],
          start_at: '',
          interval_minutes: 0,
        }),
      ).toThrow();
    });

    it('attachmentUploadSchema enforces the 50MB ceiling', () => {
      expect(
        attachmentUploadSchema.parse({ filename: 'r.pdf', size_bytes: 1000, content_type: 'application/pdf' }),
      ).toBeDefined();
      expect(() => attachmentUploadSchema.parse({ filename: 'r.pdf', size_bytes: 50 * 1024 * 1024 + 1 })).toThrow();
    });

    it('systemSettingsSchema enforces bounds', () => {
      expect(
        systemSettingsSchema.parse({ default_daily_email_limit: 1, global_daily_email_limit: 1, email_sending_enabled: true }),
      ).toBeDefined();
      expect(() =>
        systemSettingsSchema.parse({ default_daily_email_limit: 0, global_daily_email_limit: 1, email_sending_enabled: true }),
      ).toThrow();
    });

    it('paginationSchema applies defaults and caps', () => {
      expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
      expect(() => paginationSchema.parse({ pageSize: 200 })).toThrow();
    });
  });
});
