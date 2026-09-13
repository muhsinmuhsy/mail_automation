/**
 * Campaign deduplication policy types and status decision logic.
 *
 * Implements the status decision table from docs/CAMPAIGN/_DEDUPLICATION.md §3.2
 * and the exclusion reason precedence from §5.2.
 */

/** Email job statuses that count as "in-flight" (pending). */
export const PENDING_JOB_STATUSES = [
  'SCHEDULED',
  'QUEUED',
  'PROCESSING',
  'RETRY_WAIT',
] as const;

/** Statuses that are checked for historical match (§6.5 partial index). */
export const HISTORY_MATCH_STATUSES = [
  'SENT',
  'SCHEDULED',
  'QUEUED',
  'PROCESSING',
  'RETRY_WAIT',
  'DELIVERY_UNKNOWN',
] as const;

/** Primary exclusion reason per selected record (§5.2). null = included. */
export type PrimaryReason =
  | 'DUPLICATE_ADDRESS'
  | 'PREVIOUSLY_SENT'
  | 'PENDING'
  | 'DELIVERY_UNKNOWN'
  | 'MISSING_VALUES';

/** Row-level classification for the recipient-status endpoint (§5.4). */
export type RecipientClassification =
  | 'ELIGIBLE'
  | 'PREVIOUSLY_SENT'
  | 'PENDING'
  | 'DELIVERY_UNKNOWN';

/** Summary of matching job history for one normalized address. */
export interface AddressHistorySummary {
  hasSent: boolean;
  hasPending: boolean;
  hasDeliveryUnknown: boolean;
  lastSentAt: Date | null;
  pendingScheduledAt: Date | null;
  /** IDs of SENT jobs — included in the material fingerprint (§5.8). */
  sentJobIds: string[];
}

/**
 * Decide whether a representative address is eligible for sending, given its
 * history and whether the user explicitly chose it for follow-up.
 *
 * Precedence (§3.2): DELIVERY_UNKNOWN > PENDING > PREVIOUSLY_SENT (unless
 * authorized) > eligible. FAILED/CANCELLED-only history is eligible.
 */
export function decideEligibility(
  history: AddressHistorySummary,
  followUpSelected: boolean
): { eligible: boolean; reason: PrimaryReason | null } {
  if (history.hasDeliveryUnknown) {
    return { eligible: false, reason: 'DELIVERY_UNKNOWN' };
  }
  if (history.hasPending) {
    return { eligible: false, reason: 'PENDING' };
  }
  if (history.hasSent && !followUpSelected) {
    return { eligible: false, reason: 'PREVIOUSLY_SENT' };
  }
  return { eligible: true, reason: null };
}

/**
 * Classify a contact for the row-status endpoint (§5.4). Unlike
 * `decideEligibility`, this returns ELIGIBLE for included contacts and omits
 * selection-dependent reasons (DUPLICATE_ADDRESS, MISSING_VALUES).
 *
 * Precedence: DELIVERY_UNKNOWN > PENDING > PREVIOUSLY_SENT > ELIGIBLE.
 */
export function classifyForRowStatus(
  history: AddressHistorySummary
): RecipientClassification {
  if (history.hasDeliveryUnknown) return 'DELIVERY_UNKNOWN';
  if (history.hasPending) return 'PENDING';
  if (history.hasSent) return 'PREVIOUSLY_SENT';
  return 'ELIGIBLE';
}

/**
 * Count breakdown by exclusion reason (§5.2 `excludedByReason`).
 */
export interface ExcludedByReason {
  duplicateAddress: number;
  previouslySent: number;
  pending: number;
  deliveryUnknown: number;
  missingValues: number;
}

export function emptyExcludedByReason(): ExcludedByReason {
  return {
    duplicateAddress: 0,
    previouslySent: 0,
    pending: 0,
    deliveryUnknown: 0,
    missingValues: 0,
  };
}

/**
 * Increment the count for a given reason. Returns a new object (immutable).
 */
export function incrementReason(
  counts: ExcludedByReason,
  reason: PrimaryReason
): ExcludedByReason {
  const next = { ...counts };
  switch (reason) {
    case 'DUPLICATE_ADDRESS': next.duplicateAddress++; break;
    case 'PREVIOUSLY_SENT': next.previouslySent++; break;
    case 'PENDING': next.pending++; break;
    case 'DELIVERY_UNKNOWN': next.deliveryUnknown++; break;
    case 'MISSING_VALUES': next.missingValues++; break;
  }
  return next;
}

/** Policy version — increment when the eligibility rules change (§5.2). */
export const POLICY_VERSION = 1;
