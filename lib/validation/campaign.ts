import { z } from 'zod';
import { nonEmptyString, uuid } from './common';

export const createCampaignSchema = z.object({
  name: nonEmptyString.max(255),
  email_account_id: uuid,
  resume_id: uuid,
  template_id: uuid,
  contact_ids: z.array(uuid).min(1),
  start_at: z.coerce.date(),
  timezone: z.string().max(64).default('UTC'),
  interval_minutes: z.coerce.number().int().positive().default(5),
  daily_limit: z.coerce.number().int().positive().nullable().optional(),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
