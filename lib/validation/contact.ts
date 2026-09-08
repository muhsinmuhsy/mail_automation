import { z } from 'zod';
import { nonEmptyString } from './common';
import { LIMITS } from './merge-field-names';
import { isValidCalendarDate, INVALID_CALENDAR_DATE_MESSAGE } from './calendar-date';

/**
 * Base contact schemas (built-in columns only). Kept as exported consts for
 * backward compatibility with existing callers (e.g. CSV import) that don't
 * yet know about custom fields.
 */
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

// ---------------------------------------------------------------------------
// Dynamic schemas for custom merge fields (Path C, Phase 3).
// ---------------------------------------------------------------------------

/** A user-defined custom field definition (subset of the Prisma model). */
export type ContactFieldDefinition = {
  id: string;
  name: string;
  field_type: 'text' | 'number' | 'date' | 'boolean';
  is_required: boolean;
};

/** Per-field Zod schema based on its type and required-ness. */
function fieldSchema(field: ContactFieldDefinition): z.ZodTypeAny {
  const maxValue = z.string().max(LIMITS.MAX_FIELD_VALUE_LENGTH);

  switch (field.field_type) {
    case 'text':
      return field.is_required
        ? maxValue.min(1)
        : maxValue.optional().nullable();
    case 'number':
      // `0` is a legitimate value — do not use .nonempty() or truthiness.
      return field.is_required
        ? z.coerce.number()
        : z.coerce.number().optional().nullable();
    case 'date':
      return z
        .string()
        .max(LIMITS.MAX_FIELD_VALUE_LENGTH)
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(isValidCalendarDate, INVALID_CALENDAR_DATE_MESSAGE)
        .optional()
        .nullable();
    case 'boolean':
      // `false` is a legitimate value — do not use truthiness.
      return field.is_required
        ? z.boolean()
        : z.boolean().optional().nullable();
    default:
      return maxValue.optional().nullable();
  }
}

/**
 * Builds a create-contact schema that includes the built-in fields plus one
 * key per custom field, typed by `field_type`. Required-ness is enforced for
 * custom fields marked `is_required`.
 */
export function buildCreateContactSchema(
  customFields: ContactFieldDefinition[]
): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {
    name: nonEmptyString.max(100),
    email: z.string().email().max(255),
    company: z.string().max(200).optional(),
    job_title: z.string().max(200).optional(),
    notes: z.string().max(5000).optional(),
  };
  for (const field of customFields) {
    shape[field.name] = fieldSchema(field);
  }
  return z.object(shape);
}

/**
 * Builds a PATCH contact schema. PATCH semantics (§11.18):
 * - A key absent from the payload means "no change".
 * - A key present with null/empty means "clear the value".
 * - Required-ness is only validated for keys present in the payload.
 */
export function buildUpdateContactSchema(
  customFields: ContactFieldDefinition[]
): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {
    name: nonEmptyString.max(100).optional(),
    email: z.string().email().max(255).optional(),
    company: z.string().max(200).optional().nullable(),
    job_title: z.string().max(200).optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
  };
  for (const field of customFields) {
    // PATCH: all custom fields are optional in the payload; required-ness is
    // enforced at the application layer for keys that are present.
    shape[field.name] = fieldSchema({ ...field, is_required: false });
  }
  return z.object(shape);
}

/**
 * Splits a parsed payload into built-in fields and custom field values.
 * Custom values are returned as a map of `field.name -> value` for the
 * caller to upsert into `ContactFieldValue`.
 */
export function splitContactPayload(
  payload: Record<string, unknown>,
  customFields: ContactFieldDefinition[]
): { builtins: Record<string, unknown>; custom: Record<string, unknown> } {
  const builtinKeys = new Set(['name', 'email', 'company', 'job_title', 'notes']);
  const customKeys = new Set(customFields.map((f) => f.name));

  const builtins: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (builtinKeys.has(key)) {
      builtins[key] = value;
    } else if (customKeys.has(key)) {
      custom[key] = value;
    }
  }
  return { builtins, custom };
}

// ---------------------------------------------------------------------------
// Type-coercion rules for field-type changes (§11.12, §11.22).
// ---------------------------------------------------------------------------

export type CoercionResult =
  | { ok: true; newValue: string | null }
  | { ok: false; error: string };

/** Coerces a single stored text value to the target field type. */
export function coerceValue(
  value: string | null,
  targetType: 'text' | 'number' | 'date' | 'boolean'
): CoercionResult {
  if (value === null || value === '') return { ok: true, newValue: null };

  switch (targetType) {
    case 'text':
      return { ok: true, newValue: value };
    case 'number':
      if (!/^-?\d+(\.\d+)?$/.test(value)) {
        return { ok: false, error: `Cannot convert "${value}" to a number.` };
      }
      return { ok: true, newValue: value };
    case 'date':
      if (!isValidCalendarDate(value)) {
        return { ok: false, error: `Cannot convert "${value}" to a date (use YYYY-MM-DD).` };
      }
      return { ok: true, newValue: value };
    case 'boolean':
      if (!['true', 'false', '1', '0'].includes(value.toLowerCase())) {
        return { ok: false, error: `Cannot convert "${value}" to a boolean.` };
      }
      return { ok: true, newValue: value };
    default:
      return { ok: false, error: `Unknown target type "${targetType}".` };
  }
}

/**
 * Coerces a batch of values. Returns ok iff every value coerces. On failure,
 * returns up to ~5 offending values for the error message (§11.12).
 */
export function coerceValues(
  values: Array<{ id: string; value: string | null }>,
  targetType: 'text' | 'number' | 'date' | 'boolean'
):
  | { ok: true; updates: Array<{ id: string; value: string | null }> }
  | { ok: false; errors: string[] } {
  const updates: Array<{ id: string; value: string | null }> = [];
  const errors: string[] = [];

  for (const row of values) {
    const result = coerceValue(row.value, targetType);
    if (result.ok) {
      updates.push({ id: row.id, value: result.newValue });
    } else {
      if (errors.length < 5) errors.push(result.error);
    }
  }

  if (errors.length > 0) {
    const more = values.length - updates.length - errors.length;
    if (more > 0) errors.push(`…and ${more} more.`);
    return { ok: false, errors };
  }
  return { ok: true, updates };
}
