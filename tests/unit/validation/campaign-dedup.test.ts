import { describe, it, expect } from 'vitest';
import {
  createCampaignSchema,
  preCheckSchema,
  recipientStatusSchema,
  resendEntrySchema,
  MAX_CAMPAIGN_CONTACTS,
  MAX_RECIPIENT_STATUS_CONTACTS,
  UNSUPPORTED_CREATION_FIELDS,
} from '@/lib/validation/campaign';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('lib/validation/campaign — extended schemas', () => {
  describe('preCheckSchema', () => {
    it('accepts valid input with defaults', () => {
      const result = preCheckSchema.parse({
        templateId: VALID_UUID,
        emailAccountId: VALID_UUID,
        contactIds: [VALID_UUID],
      });
      expect(result.attachmentIds).toEqual([]);
      expect(result.resendRecipients).toEqual([]);
      expect(result.missingValueAction).toBe('exclude');
      expect(result.unknownTokenAction).toBe('fix');
      expect(result.intervalMinutes).toBe(5);
    });

    it('rejects duplicate contactIds', () => {
      expect(() =>
        preCheckSchema.parse({
          templateId: VALID_UUID,
          emailAccountId: VALID_UUID,
          contactIds: [VALID_UUID, VALID_UUID],
        })
      ).toThrow();
    });

    it('rejects more than 1000 contacts', () => {
      const ids = Array.from({ length: 1001 }, (_, i) =>
        `550e8400-e29b-41d4-a716-${i.toString(16).padStart(4, '0')}`
      );
      expect(() =>
        preCheckSchema.parse({
          templateId: VALID_UUID,
          emailAccountId: VALID_UUID,
          contactIds: ids,
        })
      ).toThrow();
    });

    it('rejects unknown fields (strict)', () => {
      expect(() =>
        preCheckSchema.parse({
          templateId: VALID_UUID,
          emailAccountId: VALID_UUID,
          contactIds: [VALID_UUID],
          extraField: 'bad',
        })
      ).toThrow();
    });
  });

  describe('recipientStatusSchema', () => {
    it('accepts valid input', () => {
      const result = recipientStatusSchema.parse({
        templateId: VALID_UUID,
        emailAccountId: VALID_UUID,
        contactIds: [VALID_UUID],
      });
      expect(result.contactIds).toEqual([VALID_UUID]);
    });

    it('rejects more than 100 contacts', () => {
      const ids = Array.from({ length: 101 }, (_, i) =>
        `550e8400-e29b-41d4-a716-${i.toString(16).padStart(4, '0')}`
      );
      expect(() =>
        recipientStatusSchema.parse({
          templateId: VALID_UUID,
          emailAccountId: VALID_UUID,
          contactIds: ids,
        })
      ).toThrow();
    });

    it('enforces max 100 contacts', () => {
      expect(MAX_RECIPIENT_STATUS_CONTACTS).toBe(100);
    });
  });

  describe('createCampaignSchema — extended', () => {
    it('accepts valid input with new fields', () => {
      expect(() =>
        createCampaignSchema.parse({
          name: 'My Campaign',
          email_account_id: VALID_UUID,
          template_id: VALID_UUID,
          contact_ids: [VALID_UUID],
          start_at: new Date('2024-01-15T09:00:00Z'),
          idempotency_key: VALID_UUID,
          preview_fingerprint: 'a'.repeat(64),
        })
      ).not.toThrow();
    });

    it('requires idempotency_key', () => {
      expect(() =>
        createCampaignSchema.parse({
          name: 'My Campaign',
          email_account_id: VALID_UUID,
          template_id: VALID_UUID,
          contact_ids: [VALID_UUID],
          start_at: new Date('2024-01-15T09:00:00Z'),
          preview_fingerprint: 'a'.repeat(64),
        })
      ).toThrow();
    });

    it('requires preview_fingerprint as 64-char hex', () => {
      expect(() =>
        createCampaignSchema.parse({
          name: 'My Campaign',
          email_account_id: VALID_UUID,
          template_id: VALID_UUID,
          contact_ids: [VALID_UUID],
          start_at: new Date('2024-01-15T09:00:00Z'),
          idempotency_key: VALID_UUID,
          preview_fingerprint: 'invalid',
        })
      ).toThrow();
    });

    it('defaults missing_value_action and unknown_token_action', () => {
      const result = createCampaignSchema.parse({
        name: 'My Campaign',
        email_account_id: VALID_UUID,
        template_id: VALID_UUID,
        contact_ids: [VALID_UUID],
        start_at: new Date('2024-01-15T09:00:00Z'),
        idempotency_key: VALID_UUID,
        preview_fingerprint: 'a'.repeat(64),
      });
      expect(result.missing_value_action).toBe('exclude');
      expect(result.unknown_token_action).toBe('fix');
    });

    it('defaults resend_recipients to empty array', () => {
      const result = createCampaignSchema.parse({
        name: 'My Campaign',
        email_account_id: VALID_UUID,
        template_id: VALID_UUID,
        contact_ids: [VALID_UUID],
        start_at: new Date('2024-01-15T09:00:00Z'),
        idempotency_key: VALID_UUID,
        preview_fingerprint: 'a'.repeat(64),
      });
      expect(result.resend_recipients).toEqual([]);
    });

    it('rejects resend_recipients larger than contact_ids', () => {
      expect(() =>
        createCampaignSchema.parse({
          name: 'My Campaign',
          email_account_id: VALID_UUID,
          template_id: VALID_UUID,
          contact_ids: [VALID_UUID],
          start_at: new Date('2024-01-15T09:00:00Z'),
          idempotency_key: VALID_UUID,
          preview_fingerprint: 'a'.repeat(64),
          resend_recipients: [
            { contact_id: VALID_UUID, recipient_email: 'a@b.com' },
            { contact_id: '550e8400-e29b-41d4-a716-446655440001', recipient_email: 'c@d.com' },
          ],
        })
      ).toThrow();
    });

    it('enforces max 1000 contacts', () => {
      expect(MAX_CAMPAIGN_CONTACTS).toBe(1000);
    });
  });

  describe('resendEntrySchema', () => {
    it('accepts valid entry', () => {
      expect(() =>
        resendEntrySchema.parse({
          contact_id: VALID_UUID,
          recipient_email: 'user@example.com',
        })
      ).not.toThrow();
    });

    it('rejects invalid email', () => {
      expect(() =>
        resendEntrySchema.parse({
          contact_id: VALID_UUID,
          recipient_email: 'not-an-email',
        })
      ).toThrow();
    });

    it('rejects invalid UUID', () => {
      expect(() =>
        resendEntrySchema.parse({
          contact_id: 'invalid',
          recipient_email: 'user@example.com',
        })
      ).toThrow();
    });
  });

  describe('UNSUPPORTED_CREATION_FIELDS', () => {
    it('lists duplicate_action and skip_already_sent', () => {
      expect(UNSUPPORTED_CREATION_FIELDS).toContain('duplicate_action');
      expect(UNSUPPORTED_CREATION_FIELDS).toContain('skip_already_sent');
    });
  });
});
