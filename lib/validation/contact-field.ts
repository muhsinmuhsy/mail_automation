import { z } from 'zod';
import { nonEmptyString, uuid } from './common';
import {
  LIMITS,
  validateFieldName,
} from './merge-field-names';

/**
 * Validation schemas for the contact-fields API (Path C, Phase 4).
 * See docs/CUSTOM_MERGE_FIELDS.md §4 Phase 4 and §11.10 (authorization).
 */

export const createContactFieldSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(LIMITS.MAX_FIELD_NAME_LENGTH)
    .refine((val) => validateFieldName(val) === null, (val) => ({
      message: validateFieldName(val) ?? 'Invalid token.',
    })),
  label: nonEmptyString.max(LIMITS.MAX_FIELD_LABEL_LENGTH),
  field_type: z.enum(['text', 'number', 'date', 'boolean']).default('text'),
  sort_order: z.number().int().default(0),
  is_required: z.boolean().default(false),
});

export const updateContactFieldSchema = z.object({
  label: nonEmptyString.max(LIMITS.MAX_FIELD_LABEL_LENGTH).optional(),
  sort_order: z.number().int().optional(),
  is_required: z.boolean().optional(),
  field_type: z.enum(['text', 'number', 'date', 'boolean']).optional(),
  /// Optimistic concurrency version (§11.24). Required on PATCH.
  version: z.number().int(),
});

export type CreateContactFieldInput = z.infer<typeof createContactFieldSchema>;
export type UpdateContactFieldInput = z.infer<typeof updateContactFieldSchema>;

/** Reorder request: the new ordered list of field IDs. */
export const reorderContactFieldsSchema = z.object({
  ordered_ids: z.array(uuid).min(1),
});
