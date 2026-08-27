import { z } from 'zod';

export const adminUpdateUserSchema = z.object({
  role: z.enum(['USER', 'ADMIN']).optional(),
  is_active: z.boolean().optional(),
  daily_email_limit_override: z.coerce.number().int().positive().nullable().optional(),
});

export const adminSettingsSchema = z.object({
  default_daily_email_limit: z.coerce.number().int().positive(),
  global_daily_email_limit: z.coerce.number().int().positive(),
  email_sending_enabled: z.boolean(),
});

export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type AdminSettingsInput = z.infer<typeof adminSettingsSchema>;
