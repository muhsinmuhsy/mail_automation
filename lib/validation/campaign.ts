import { MAX_CAMPAIGN_ATTACHMENTS } from '@/lib/email/attachment-limits';
import { z } from 'zod';
import { isValidTimezone } from '@/lib/scheduling/time';
import { nonEmptyString, uuid, email } from './common';

/** Maximum contacts per campaign selection (§3.3 step 1). */
export const MAX_CAMPAIGN_CONTACTS = 1000;

/** Maximum contacts per recipient-status request (§5.4). */
export const MAX_RECIPIENT_STATUS_CONTACTS = 100;

/** Shared resend entry schema — snake_case (creation endpoint, §5.7). */
export const resendEntrySchema = z.object({
  contact_id: uuid,
  recipient_email: email,
}).strict();

/** Pre-check request schema — camelCase (§5.7). */
export const preCheckSchema = z.object({
  templateId: uuid,
  emailAccountId: uuid,
  contactIds: z.array(uuid).min(1).max(MAX_CAMPAIGN_CONTACTS).refine(
    ids => new Set(ids).size === ids.length,
    'Duplicate contact IDs are not allowed.'
  ),
  attachmentIds: z.array(uuid).max(MAX_CAMPAIGN_ATTACHMENTS).refine(
    ids => new Set(ids).size === ids.length,
    'Choose each attachment only once.'
  ).default([]),
  resendRecipients: z.array(z.object({
    contactId: uuid,
    recipientEmail: email,
  }).strict()).max(MAX_CAMPAIGN_CONTACTS).default([]),
  missingValueAction: z.enum(['exclude', 'continue']).default('exclude'),
  unknownTokenAction: z.enum(['fix', 'continue']).default('fix'),
  startAt: z.coerce.date().optional(),
  timezone: z.string().trim().max(64).refine(isValidTimezone, 'Choose a valid IANA timezone.').default('UTC'),
  intervalMinutes: z.coerce.number().int().positive().default(5),
  dailyLimit: z.coerce.number().int().positive().nullable().optional(),
}).strict();

export type PreCheckInput = z.infer<typeof preCheckSchema>;

/** Recipient-status request schema — camelCase, max 100 contacts (§5.7). */
export const recipientStatusSchema = z.object({
  templateId: uuid,
  emailAccountId: uuid,
  contactIds: z.array(uuid).min(1).max(MAX_RECIPIENT_STATUS_CONTACTS).refine(
    ids => new Set(ids).size === ids.length,
    'Duplicate contact IDs are not allowed.'
  ),
}).strict();

export type RecipientStatusInput = z.infer<typeof recipientStatusSchema>;

/** Campaign creation request schema — snake_case (§5.7). */
export const createCampaignSchema = z.object({
  name: nonEmptyString.max(255),
  email_account_id: uuid,
  attachment_id: uuid.optional(),
  attachment_ids: z.array(uuid).max(MAX_CAMPAIGN_ATTACHMENTS).refine(
    ids => new Set(ids).size === ids.length,
    'Choose each attachment only once.'
  ).optional(),
  template_id: uuid,
  contact_ids: z.array(uuid).min(1).max(MAX_CAMPAIGN_CONTACTS).refine(
    ids => new Set(ids).size === ids.length,
    'Choose each contact only once.'
  ),
  start_at: z.coerce.date(),
  timezone: z.string().trim().max(64).refine(isValidTimezone, 'Choose a valid IANA timezone.').default('UTC'),
  interval_minutes: z.coerce.number().int().positive().default(5),
  daily_limit: z.coerce.number().int().positive().nullable().optional(),
  idempotency_key: uuid,
  preview_fingerprint: z.string().regex(/^[0-9a-f]{64}$/, 'Invalid preview fingerprint.'),
  resend_recipients: z.array(resendEntrySchema).max(MAX_CAMPAIGN_CONTACTS).default([]),
  missing_value_action: z.enum(['exclude', 'continue']).default('exclude'),
  unknown_token_action: z.enum(['fix', 'continue']).default('fix'),
}).strict()
  .refine(
    data => !(data.attachment_id && data.attachment_ids !== undefined),
    { message: 'Use attachment_ids only.', path: ['attachment_ids'] }
  )
  .refine(
    data => data.resend_recipients.length <= data.contact_ids.length,
    { message: 'Follow-up recipients must be a subset of selected contacts.', path: ['resend_recipients'] }
  );

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/** Submission lookup path param — UUID idempotency key (§5.5). */
export const submissionKeyParamSchema = z.object({
  key: uuid,
});

/** Fields that are no longer supported and must be rejected (§5.3). */
export const UNSUPPORTED_CREATION_FIELDS = ['duplicate_action', 'skip_already_sent'];
