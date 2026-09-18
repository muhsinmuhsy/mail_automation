/**
 * Custom-field filter parsing and Prisma where-clause builder.
 *
 * Filter format in URL query param `cf`:
 *   cf=fieldId:op:value,fieldId2:op2:value2
 *
 * Operators per field type:
 *   text     → contains, eq
 *   number   → eq, gt, gte, lt, lte
 *   date     → eq, before (lt), after (gt)
 *   boolean  → is (eq "true"/"false")
 *   dropdown → eq (exact option value)
 */

export interface CustomFieldFilter {
  fieldId: string;
  op: string;
  value: string;
}

/** Operators that each field type supports, in display order. */
export const OPERATORS_BY_TYPE: Record<string, Array<{ value: string; label: string }>> = {
  text: [
    { value: 'contains', label: 'contains' },
    { value: 'eq', label: 'is exactly' },
  ],
  number: [
    { value: 'eq', label: 'equals' },
    { value: 'gt', label: 'greater than' },
    { value: 'gte', label: 'greater or equal' },
    { value: 'lt', label: 'less than' },
    { value: 'lte', label: 'less or equal' },
  ],
  date: [
    { value: 'eq', label: 'on' },
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
  ],
  boolean: [
    { value: 'is', label: 'is' },
  ],
  dropdown: [
    { value: 'eq', label: 'is' },
  ],
};

/**
 * Parse the `cf` query param into an array of filters.
 * Format: `fieldId:op:value,fieldId2:op2:value2`
 * Values may contain colons (we split on first 2 colons only).
 * Returns empty array for null/empty input.
 */
export function parseCustomFieldFilters(cf: string | null): CustomFieldFilter[] {
  if (!cf) return [];
  const results: CustomFieldFilter[] = [];
  for (const expr of cf.split(',')) {
    const firstColon = expr.indexOf(':');
    if (firstColon === -1) continue;
    const secondColon = expr.indexOf(':', firstColon + 1);
    if (secondColon === -1) continue;
    const fieldId = expr.slice(0, firstColon);
    const op = expr.slice(firstColon + 1, secondColon);
    const value = expr.slice(secondColon + 1);
    if (!fieldId || !op || !value) continue;
    results.push({ fieldId, op, value });
  }
  return results;
}

/**
 * Serialize filters back to the `cf` query param format.
 */
export function serializeCustomFieldFilters(filters: CustomFieldFilter[]): string {
  return filters.map((f) => `${f.fieldId}:${f.op}:${f.value}`).join(',');
}

/**
 * Build a Prisma `where` fragment for a single filter's value comparison.
 * Maps operator to the appropriate Prisma string filter.
 */
function buildValueFilter(op: string, value: string): Record<string, unknown> {
  switch (op) {
    case 'contains':
      return { contains: value, mode: 'insensitive' };
    case 'eq':
    case 'is':
      return { equals: value };
    case 'neq':
      return { not: value };
    case 'gt':
    case 'after':
      return { gt: value };
    case 'gte':
      return { gte: value };
    case 'lt':
    case 'before':
      return { lt: value };
    case 'lte':
      return { lte: value };
    default:
      return { equals: value };
  }
}

/**
 * Build a Prisma `where` fragment that ANDs together all custom-field filters.
 * Each filter becomes an `EXISTS` subquery on `contact_field_values`.
 * Returns `{}` when no filters, so the spread is a no-op.
 */
export function customFieldFilterWhere(
  filters: CustomFieldFilter[]
): Record<string, unknown> {
  if (filters.length === 0) return {};
  return {
    AND: filters.map((f) => ({
      contact_field_values: {
        some: {
          field_id: f.fieldId,
          value: buildValueFilter(f.op, f.value),
        },
      },
    })),
  };
}
