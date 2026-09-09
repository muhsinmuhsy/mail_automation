import { z } from 'zod';
import { ValidationError } from '@/lib/errors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailSchema = z
  .string()
  .trim()
  .min(3, 'Email is too short.')
  .max(255, 'Email is too long.')
  .regex(EMAIL_RE, 'Enter a valid email address.');

export const contactSchema = z.object({
  name: z.string().trim().max(100, 'Name is too long.').optional().or(z.literal('')),
  email: emailSchema,
});

export const contactImportSchema = z.array(contactSchema).max(500, 'Too many contacts per import.');

export const templateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name is too long.'),
  subject: z.string().trim().min(1, 'Subject is required.').max(200, 'Subject is too long.'),
  body: z.string().trim().min(1, 'Body is required.').max(100000, 'Body is too long.'),
});

export const emailAccountSchema = z.object({
  provider: z.enum(['gmail', 'microsoft', 'yahoo', 'custom_smtp']),
  email: emailSchema,
  auth_method: z.enum(['app_password', 'oauth2', 'password']),
  secret: z.string().min(1).max(2000).optional(),
  refresh_token: z.string().max(4000).optional(),
});

export const campaignSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(255, 'Name is too long.'),
  email_account_id: z.string().uuid('Invalid email account.'),
  attachment_id: z.string().uuid('Invalid attachment.'),
  template_id: z.string().uuid('Invalid template.'),
  contact_ids: z.array(z.string().uuid()).min(1, 'Select at least one contact.').max(5000),
  start_at: z.string().min(1, 'Start time is required.'),
  timezone: z.string().min(1).max(64).default('UTC'),
  interval_minutes: z.number().int().min(1, 'Interval must be at least 1 minute.').max(1440, 'Interval cannot exceed 24 hours.'),
  daily_limit: z.number().int().min(1).max(100000).optional(),
});

export const attachmentUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255, 'Filename is too long.'),
  size_bytes: z.number().int().min(1).max(50 * 1024 * 1024, 'File exceeds 50MB.').optional(),
  content_type: z.string().max(255).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const systemSettingsSchema = z.object({
  default_daily_email_limit: z.number().int().min(1, 'Must be at least 1.').max(100000),
  global_daily_email_limit: z.number().int().min(1, 'Must be at least 1.').max(1000000),
  email_sending_enabled: z.boolean(),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type TemplateInput = z.infer<typeof templateSchema>;
export type CampaignInput = z.infer<typeof campaignSchema>;
export type EmailAccountInput = z.infer<typeof emailAccountSchema>;
export type SystemSettingsInput = z.infer<typeof systemSettingsSchema>;

/**
 * Parses `value` with `schema`, throwing a {@link ValidationError} carrying
 * the flattened field errors when invalid.
 */
export function validate<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown
): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.flatten();
    throw new ValidationError('Validation failed.', details);
  }
  return result.data;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON.');
  }
}
