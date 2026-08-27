import { z } from 'zod';
import { email, nonEmptyString } from './common';

export const createEmailAccountSchema = z.object({
  provider: z.enum(['gmail', 'microsoft', 'yahoo', 'custom_smtp']),
  email,
  auth_method: z.enum(['app_password', 'oauth2', 'password']),
  secret: nonEmptyString.max(100),
});

export const testEmailAccountSchema = z.object({
  secret: nonEmptyString.max(100),
});

export type CreateEmailAccountInput = z.infer<typeof createEmailAccountSchema>;
export type TestEmailAccountInput = z.infer<typeof testEmailAccountSchema>;
