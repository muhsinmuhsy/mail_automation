import { z } from 'zod';
import { uuid } from './common';

export const createAttachmentSchema = z.object({
  filename: z.string().max(255),
  mimeType: z.string().max(100).default('application/pdf'),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
});

export const setDefaultAttachmentSchema = z.object({
  attachment_id: uuid,
});

export type CreateAttachmentInput = z.infer<typeof createAttachmentSchema>;
export type SetDefaultAttachmentInput = z.infer<typeof setDefaultAttachmentSchema>;
