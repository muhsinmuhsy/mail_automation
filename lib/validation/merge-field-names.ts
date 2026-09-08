/**
 * Central reserved merge-field name registry (§11.2) and resource limits
 * (§11.14). Imported by the API route, the validation schema builder, and the
 * UI picker so the list lives in ONE place — divergence between them is a
 * security bug waiting to happen.
 */

import { SUPPORTED_TEMPLATE_VARIABLES } from '@/lib/email/template';

/**
 * Built-in field names that are already exposed as merge tokens. A custom
 * field may not reuse any of these names.
 */
export const BUILTIN_MERGE_FIELD_NAMES: readonly string[] = SUPPORTED_TEMPLATE_VARIABLES;

/**
 * Built-in contact columns that are NOT merge tokens but still reserved
 * because creating a custom field with these names would collide with the
 * column (§11.2).
 */
export const BUILTIN_COLUMN_NAMES: readonly string[] = ['notes'] as const;

/**
 * System/database tokens reserved for future system merge tags or that must
 * never be exposed as merge tokens because they're database columns.
 */
export const SYSTEM_RESERVED_TOKENS: readonly string[] = [
  'id',
  'user_id',
  'contact_id',
  'campaign',
  'date',
  'unsubscribe',
  'unsubscribe_url',
] as const;

/** Tokens reserved for future system use (namespace prefix). */
export const RESERVED_PREFIXES: readonly string[] = ['_'] as const;

/**
 * Returns true if `name` is reserved and may not be used as a custom merge
 * field token. Checks built-ins, system tokens, and the `_` prefix.
 */
export function isReservedMergeFieldName(name: string): boolean {
  const lower = name.toLowerCase();
  if (BUILTIN_MERGE_FIELD_NAMES.includes(lower)) return true;
  if (BUILTIN_COLUMN_NAMES.includes(lower)) return true;
  if (SYSTEM_RESERVED_TOKENS.includes(lower)) return true;
  for (const prefix of RESERVED_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

/** Resource limits (§11.14). Defaults are configurable via env at call sites. */
export const LIMITS = {
  MAX_CUSTOM_FIELDS_PER_USER: 100,
  MAX_CSV_COLUMNS: 100,
  MAX_CSV_ROWS: 50_000,
  MAX_CSV_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_FIELD_NAME_LENGTH: 50,
  MAX_FIELD_LABEL_LENGTH: 100,
  MAX_FIELD_VALUE_LENGTH: 10_000,
  /** Batch size for large CSV imports (§11.20). */
  CSV_IMPORT_BATCH_SIZE: 1_000,
  /** Report progress above this many rows (§11.20). */
  CSV_PROGRESS_THRESHOLD: 5_000,
} as const;

/** Regex for a valid custom field token: lowercase, alphanumeric + underscore. */
export const FIELD_NAME_REGEX = /^[a-z][a-z0-9_]*$/;

/** Validates a candidate field token. Returns an error message or null. */
export function validateFieldName(name: string): string | null {
  if (!name || name.length === 0) return 'Token is required.';
  if (name.length > LIMITS.MAX_FIELD_NAME_LENGTH) {
    return `Token must be ${LIMITS.MAX_FIELD_NAME_LENGTH} characters or fewer.`;
  }
  if (!FIELD_NAME_REGEX.test(name)) {
    return 'Token must start with a letter and contain only lowercase letters, numbers, and underscores.';
  }
  if (isReservedMergeFieldName(name)) {
    return 'This token is reserved and cannot be used.';
  }
  return null;
}

/**
 * Auto-generates a token from a display label (§11.15). Lowercases, replaces
 * non-alphanumeric runs with underscores, strips leading non-letters, and
 * truncates to MAX_FIELD_NAME_LENGTH. Returns an empty string if the label
 * yields no usable characters.
 */
export function generateTokenFromLabel(label: string): string {
  const lowered = label.toLowerCase().trim();
  if (!lowered) return '';
  // Replace any run of non-alphanumeric chars with a single underscore.
  const replaced = lowered.replace(/[^a-z0-9]+/g, '_');
  // Strip leading underscores/digits (token must start with a letter).
  const stripped = replaced.replace(/^[^a-z]+/, '');
  return stripped.slice(0, LIMITS.MAX_FIELD_NAME_LENGTH);
}

/**
 * Returns a non-colliding token: if `token` collides with any entry in
 * `existingTokens` or is reserved, appends `_2`, `_3`, … until unique.
 */
export function ensureUniqueToken(
  token: string,
  existingTokens: readonly string[]
): string {
  const existing = new Set(existingTokens.map((t) => t.toLowerCase()));
  if (!existing.has(token) && !isReservedMergeFieldName(token)) {
    return token;
  }
  for (let i = 2; i < 1000; i++) {
    const candidate = `${token}_${i}`.slice(0, LIMITS.MAX_FIELD_NAME_LENGTH);
    if (!existing.has(candidate) && !isReservedMergeFieldName(candidate)) {
      return candidate;
    }
  }
  // Extremely unlikely fallback.
  return `${token}_${Date.now()}`.slice(0, LIMITS.MAX_FIELD_NAME_LENGTH);
}
