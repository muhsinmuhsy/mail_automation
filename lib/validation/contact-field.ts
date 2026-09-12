import { z } from 'zod';
import { nonEmptyString, uuid } from './common';
import {
  LIMITS,
  validateFieldName,
} from './merge-field-names';

const FIELD_TYPES = ['text', 'number', 'date', 'boolean', 'dropdown'] as const;

const fieldOptionSchema = z.object({
  value: z.string().min(1).max(100),
  label: z.string().min(1).max(100),
});

const optionsSchema = z.array(fieldOptionSchema).min(1).max(50);

export const createContactFieldSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(LIMITS.MAX_FIELD_NAME_LENGTH)
    .refine((val) => validateFieldName(val) === null, (val) => ({
      message: validateFieldName(val) ?? 'Invalid token.',
    })),
  label: nonEmptyString.max(LIMITS.MAX_FIELD_LABEL_LENGTH),
  field_type: z.enum(FIELD_TYPES).default('text'),
  options: optionsSchema.optional(),
  sort_order: z.number().int().default(0),
  is_required: z.boolean().default(false),
}).refine(
  (data) => data.field_type !== 'dropdown' || (data.options !== undefined && data.options.length > 0),
  { message: 'Dropdown fields require at least one option.' }
);

export const updateContactFieldSchema = z.object({
  label: nonEmptyString.max(LIMITS.MAX_FIELD_LABEL_LENGTH).optional(),
  sort_order: z.number().int().optional(),
  is_required: z.boolean().optional(),
  field_type: z.enum(FIELD_TYPES).optional(),
  options: optionsSchema.optional(),
  version: z.number().int(),
}).refine(
  (data) => data.field_type !== 'dropdown' || (data.options !== undefined && data.options.length > 0),
  { message: 'Dropdown fields require at least one option.' }
);

export type CreateContactFieldInput = z.infer<typeof createContactFieldSchema>;
export type UpdateContactFieldInput = z.infer<typeof updateContactFieldSchema>;

export const reorderContactFieldsSchema = z.object({
  ordered_ids: z.array(uuid).min(1),
});
