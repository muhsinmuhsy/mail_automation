/**
 * Email job status breakdown — shared types and helpers.
 *
 * Used by both the campaigns list API and detail API to attach
 * per-status counts to each campaign, and by the frontend
 * EmailStatusBreakdown component for display.
 */

export interface StatusCount {
  status: string;
  count: number;
}

/** Colors and labels for each email job status, in display order. */
export const STATUS_CONFIG: Array<{ status: string; label: string; dotClass: string; textClass: string }> = [
  { status: 'SENT', label: 'Sent', dotClass: 'bg-success', textClass: 'text-success' },
  { status: 'FAILED', label: 'Failed', dotClass: 'bg-error', textClass: 'text-error' },
  { status: 'SCHEDULED', label: 'Scheduled', dotClass: 'bg-information', textClass: 'text-information' },
  { status: 'QUEUED', label: 'Queued', dotClass: 'bg-information', textClass: 'text-information' },
  { status: 'PROCESSING', label: 'Sending', dotClass: 'bg-warning', textClass: 'text-warning' },
  { status: 'RETRY_WAIT', label: 'Retry wait', dotClass: 'bg-warning', textClass: 'text-warning' },
  { status: 'CANCELLED', label: 'Cancelled', dotClass: 'bg-neutral-400', textClass: 'text-text-secondary' },
  { status: 'DELIVERY_UNKNOWN', label: 'Unknown', dotClass: 'bg-warning', textClass: 'text-warning' },
];

/**
 * Convert a Prisma groupBy result array into a StatusCount[] sorted
 * by the display order in STATUS_CONFIG.
 */
export function toStatusCounts(
  rows: Array<{ status: string; _count: number }>
): StatusCount[] {
  const map = new Map(rows.map(r => [r.status, r._count]));
  return STATUS_CONFIG
    .filter(c => map.has(c.status))
    .map(c => ({ status: c.status, count: map.get(c.status)! }));
}
