/**
 * Builds the flat, approved-token map consumed by `replaceTemplateVariables`.
 *
 * ## Why this exists (see docs/CUSTOM_MERGE_FIELDS.md §11.19, §11.26)
 *
 * The raw Prisma `Contact` object exposes `id`, `user_id`, `created_at`,
 * `updated_at`, and relation fields. None of these should be resolvable via
 * `{{id}}`, `{{user_id}}`, etc. in an outgoing email. This helper returns a
 * flat map containing ONLY:
 *   - the built-in field names (`name`, `email`)
 *   - the user's defined custom field names mapped to their per-contact values
 *
 * The returned map is created with `Object.create(null)` (no prototype chain)
 * so `{{constructor}}`, `{{__proto__}}`, `{{toString}}`, `{{valueOf}}`
 * resolve to undefined and are left as literal tokens by the substitution
 * engine. `replaceTemplateVariables` additionally uses `hasOwnProperty` —
 * defense in depth.
 */

import type { FieldType } from '@/lib/generated/prisma/enums';
import { SUPPORTED_TEMPLATE_VARIABLES } from './template';

/** Built-in field names that may be exposed as merge tokens. */
export const BUILTIN_FIELD_NAMES = SUPPORTED_TEMPLATE_VARIABLES;

/** A user-defined custom field definition (subset of the Prisma model). */
export type ContactFieldDefinition = {
  id: string;
  name: string;
  field_type: FieldType;
};

/** A per-contact custom field value (subset of the Prisma model). */
export type ContactFieldValueRow = {
  field_id: string;
  value: string | null;
};

/** Minimal built-in contact shape required to populate merge tokens. */
export type ContactBuiltinFields = {
  name?: string | null;
  email?: string | null;
};

/** The prototype-less flat map returned to the substitution engine. */
export type TemplateContact = Record<string, string | null | undefined>;

/**
 * Flatten a contact + its custom field values into a prototype-less map of
 * approved merge tokens.
 *
 * @param contact       Built-in contact columns (`name`, `email`, …).
 * @param fieldValues   Per-contact `ContactFieldValue` rows.
 * @param fieldDefinitions The user's `ContactField` definitions. Only tokens
 *   in this list (plus the built-ins) are included in the returned object —
 *   this is the approved-token boundary.
 *
 * The `fieldDefinitions` array is typically indexed by `field_id`; we accept
 * it as a list and build a lookup internally so callers don't have to.
 */
export function buildTemplateContact(
  contact: ContactBuiltinFields,
  fieldValues: ContactFieldValueRow[],
  fieldDefinitions: ContactFieldDefinition[]
): TemplateContact {
  // Prototype-less map: {{constructor}}, {{__proto__}}, … resolve to undefined.
  const result = Object.create(null) as TemplateContact;

  // Built-ins. `first_name` is derived inside `replaceTemplateVariables`.
  result.name = contact.name ?? null;
  result.email = contact.email ?? null;

  // Index field definitions by id for O(1) lookup.
  const definitionById = new Map<string, ContactFieldDefinition>();
  for (const def of fieldDefinitions) {
    if (def?.id) {
      definitionById.set(def.id, def);
    }
  }

  // Flatten custom field values keyed by their token name.
  for (const row of fieldValues) {
    const def = definitionById.get(row.field_id);
    if (!def) continue;
    // Only approved tokens make it into the map — the security boundary.
    result[def.name] = row.value ?? null;
  }

  return result;
}

/**
 * Convenience: returns the list of approved token names (built-ins + the
 * user's custom field names). Used by the merge-tag picker and the missing-
 * value pre-check.
 */
export function approvedTokenNames(
  userFieldDefinitions: ContactFieldDefinition[]
): string[] {
  return [...BUILTIN_FIELD_NAMES, ...userFieldDefinitions.map((f) => f.name)];
}
