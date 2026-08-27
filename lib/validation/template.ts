import { z } from 'zod';
import { nonEmptyString, uuid } from './common';

export const createTemplateSchema = z.object({
  name: nonEmptyString.max(100),
  subject: nonEmptyString.max(200),
  body: z.string().max(100000),
});

export const updateTemplateSchema = z.object({
  name: nonEmptyString.max(100).optional(),
  subject: nonEmptyString.max(200).optional(),
  body: z.string().max(100000).optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
