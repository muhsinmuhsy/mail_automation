import { z } from 'zod';
import { nonEmptyString } from './common';

/**
 * Max size for the Templatical editor JSON string (generous — complex templates
 * with many blocks can be large). See docs/TEMPLATICAL_EMAIL_BUILDER.md §7.1.
 */
const BODY_JSON_MAX = 500_000;

export const createTemplateSchema = z.object({
  name: nonEmptyString.max(100),
  subject: nonEmptyString.max(200),
  body: z.string().max(100000).optional(),
  bodyJson: z.string().max(BODY_JSON_MAX).optional(),
}).refine(
  (data) => data.body !== undefined || data.bodyJson !== undefined,
  { message: 'Either body or bodyJson is required.' }
);

export const updateTemplateSchema = z.object({
  name: nonEmptyString.max(100).optional(),
  subject: nonEmptyString.max(200).optional(),
  body: z.string().max(100000).optional(),
  bodyJson: z.string().max(BODY_JSON_MAX).optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
