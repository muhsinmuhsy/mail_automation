/**
 * Per-contact template variable substitution for email campaigns.
 *
 * Templates may embed `{{variable}}` tokens. Supported tokens map to Contact
 * fields; `first_name` is derived from the contact's `name`. Unknown tokens are
 * left untouched so authors can spot them. Substitution is idempotent: text
 * that has already been resolved (no remaining tokens) is returned unchanged.
 *
 * ## Security boundaries (see docs/CUSTOM_MERGE_FIELDS.md §11.19, §11.26)
 *
 * - **Non-recursive:** values are inserted verbatim. If `contact.size` is
 *   `"{{plan}}"`, the email contains the literal `{{plan}}`, not the plan
 *   value. Verified by tests.
 * - **Prototype-pollution safe:** token lookup uses
 *   `Object.prototype.hasOwnProperty.call(contact, varName)` before reading
 *   the value, so `{{constructor}}`, `{{__proto__}}`, `{{toString}}`,
 *   `{{valueOf}}` resolve to undefined and are left as literal tokens.
 *   `buildTemplateContact` (see `template-contact.ts`) additionally returns a
 *   prototype-less `Object.create(null)` map — defense in depth.
 * - **HTML/script passthrough:** values are inserted as plain text. If a value
 *   is `"<script>alert(1)</script>"`, the substituted body contains the
 *   literal string. Whether this is dangerous depends on downstream MIME
 *   generation (`lib/email/mime.ts`) and the email client. The substitution
 *   engine does not execute or recursively resolve values.
 */

export const SUPPORTED_TEMPLATE_VARIABLES = [
  'name',
  'email',
  'company',
  'job_title',
  'first_name',
] as const;

/**
 * Flat map of approved merge tokens → string-ish values. Built by
 * `buildTemplateContact` to contain ONLY built-in + user-defined custom field
 * tokens (never raw Prisma fields like `id`, `user_id`, `created_at`).
 *
 * The map is created with `Object.create(null)` so prototype-pollution tokens
 * (`constructor`, `__proto__`, …) resolve to undefined.
 */
export type TemplateContact = Record<string, string | null | undefined> & {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  job_title?: string | null;
};

/** Regex used to detect `{{token}}` patterns. Exported for reuse (§11.19). */
export const VARIABLE_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

export function replaceTemplateVariables(text: string, contact: TemplateContact): string {
  if (!text) return text;

  return text.replace(VARIABLE_PATTERN, (match, rawVar: string) => {
    const varName = rawVar.toLowerCase();

    if (varName === 'first_name') {
      const name = contact.name ?? '';
      return name.split(/\s+/)[0] ?? '';
    }

    // Prototype-pollution safeguard (§11.26): only read own properties.
    if (!Object.prototype.hasOwnProperty.call(contact, varName)) {
      return match;
    }
    const value = contact[varName];
    if (value == null) {
      return match;
    }
    return String(value);
  });
}
