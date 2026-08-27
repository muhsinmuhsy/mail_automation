import { z } from 'zod';
import { uuid } from './common';

export const createResumeSchema = z.object({
  filename: z.string().max(255),
  mimeType: z.string().max(100).default('application/pdf'),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
});

export const setDefaultResumeSchema = z.object({
  resume_id: uuid,
});

export type CreateResumeInput = z.infer<typeof createResumeSchema>;
export type SetDefaultResumeInput = z.infer<typeof setDefaultResumeSchema>;
