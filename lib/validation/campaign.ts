import { z } from 'zod';
import { isValidTimezone } from '@/lib/scheduling/time';
import { nonEmptyString, uuid } from './common';

export const createCampaignSchema = z.object({
  name: nonEmptyString.max(255),
  email_account_id: uuid,
  attachment_id: uuid,
  template_id: uuid,
  contact_ids: z.array(uuid).min(1),
  start_at: z.coerce.date(),
  timezone: z.string().trim().max(64).refine(isValidTimezone, 'Choose a valid IANA timezone.').default('UTC'),
  interval_minutes: z.coerce.number().int().positive().default(5),
  daily_limit: z.coerce.number().int().positive().nullable().optional(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
