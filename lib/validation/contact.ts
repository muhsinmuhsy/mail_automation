import { z } from 'zod';
import { email, nonEmptyString, uuid } from './common';

export const createContactSchema = z.object({
  name: nonEmptyString.max(100),
  email: z.string().email().max(255),
  company: z.string().max(200).optional(),
  job_title: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});

export const updateContactSchema = z.object({
  name: nonEmptyString.max(100).optional(),
  email: z.string().email().max(255).optional(),
  company: z.string().max(200).optional().nullable(),
  job_title: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const importCsvSchema = z.object({
  csv: z.instanceof(File),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
