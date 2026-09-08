/**
 * Calendar-validating date helper (§11.22). Date-only YYYY-MM-DD, NOT
 * datetime. The round-trip check rejects impossible calendar dates like
 * `2026-02-31` because `new Date('2026-02-31T00:00:00Z')` rolls over to
 * March 3 and the round-trip doesn't match.
 */

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Returns true iff `value` is a calendar-valid YYYY-MM-DD date. */
export function isValidCalendarDate(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Zod refine message for invalid calendar dates. */
export const INVALID_CALENDAR_DATE_MESSAGE = 'Invalid calendar date. Use YYYY-MM-DD.';
