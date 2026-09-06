import { MAX_CAMPAIGN_ATTACHMENTS } from '@/lib/email/attachment-limits';
import { z } from 'zod';
import { isValidTimezone } from '@/lib/scheduling/time';
import { nonEmptyString, uuid } from './common';

export const createCampaignSchema = z.object({
  name: nonEmptyString.max(255),
  email_account_id: uuid,
  attachment_id: uuid.optional(),
  attachment_ids: z.array(uuid).max(MAX_CAMPAIGN_ATTACHMENTS).refine(ids => new Set(ids).size === ids.length, 'Choose each attachment only once.').optional(),
  template_id: uuid,
  contact_ids: z.array(uuid).min(1),
  start_at: z.coerce.date(),
  timezone: z.string().trim().max(64).refine(isValidTimezone, 'Choose a valid IANA timezone.').default('UTC'),
  interval_minutes: z.coerce.number().int().positive().default(5),
  daily_limit: z.coerce.number().int().positive().nullable().optional(),
}).refine(data => !(data.attachment_id && data.attachment_ids !== undefined), { message: 'Use attachment_ids only.', path: ['attachment_ids'] });

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
