import { z } from 'zod';
import { email, nonEmptyString } from './common';

export const createEmailAccountSchema = z.object({
  provider: z.enum(['gmail', 'microsoft', 'yahoo', 'custom_smtp']),
  email,
  // App password disabled — 'app_password' removed from enum for future re-enablement
  auth_method: z.enum(['oauth2', 'password']),
  // secret: nonEmptyString.max(100),
});

export const testEmailAccountSchema = z.object({
  // App password disabled — secret field commented out for future re-enablement
  // secret: nonEmptyString.max(100),
});

export const updateEmailAccountSecretSchema = z.object({
  // App password disabled — secret field commented out for future re-enablement
  // secret: nonEmptyString.max(100),
});

export type CreateEmailAccountInput = z.infer<typeof createEmailAccountSchema>;
export type TestEmailAccountInput = z.infer<typeof testEmailAccountSchema>;
export type UpdateEmailAccountSecretInput = z.infer<typeof updateEmailAccountSecretSchema>;
