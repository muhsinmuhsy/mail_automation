/**
 * Per-contact template variable substitution for email campaigns.
 *
 * Templates may embed `{{variable}}` tokens. Supported tokens map to Contact
 * fields; `first_name` is derived from the contact's `name`. Unknown tokens are
 * left untouched so authors can spot them. Substitution is idempotent: text
 * that has already been resolved (no remaining tokens) is returned unchanged.
 */

export const SUPPORTED_TEMPLATE_VARIABLES = [
  'name',
  'email',
  'company',
  'job_title',
  'first_name',
] as const;

export type TemplateContact = {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  job_title?: string | null;
};

const VARIABLE_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

export function replaceTemplateVariables(text: string, contact: TemplateContact): string {
  if (!text) return text;

  return text.replace(VARIABLE_PATTERN, (match, rawVar: string) => {
    const varName = rawVar.toLowerCase();

    if (varName === 'first_name') {
      const name = contact.name ?? '';
      return name.split(/\s+/)[0] ?? '';
    }

    const value = contact[varName as keyof TemplateContact];
    if (value == null) {
      return match;
    }
    return String(value);
  });
}
