import { describe, it, expect } from 'vitest';
import {
  decideEligibility,
  classifyForRowStatus,
  emptyExcludedByReason,
  incrementReason,
  POLICY_VERSION,
  type AddressHistorySummary,
} from '@/lib/campaigns/policy';

function makeHistory(overrides: Partial<AddressHistorySummary> = {}): AddressHistorySummary {
  return {
    hasSent: false,
    hasPending: false,
    hasDeliveryUnknown: false,
    lastSentAt: null,
    pendingScheduledAt: null,
    sentJobIds: [],
    ...overrides,
  };
}

describe('lib/campaigns/policy', () => {
  describe('decideEligibility', () => {
    it('returns eligible when no history', () => {
      const result = decideEligibility(makeHistory(), false);
      expect(result.eligible).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('excludes DELIVERY_UNKNOWN (highest precedence)', () => {
      const result = decideEligibility(
        makeHistory({ hasDeliveryUnknown: true, hasSent: true, hasPending: true }),
        true
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('DELIVERY_UNKNOWN');
    });

    it('excludes PENDING (over PREVIOUSLY_SENT)', () => {
      const result = decideEligibility(
        makeHistory({ hasPending: true, hasSent: true }),
        true
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('PENDING');
    });

    it('excludes PREVIOUSLY_SENT when not chosen for follow-up', () => {
      const result = decideEligibility(makeHistory({ hasSent: true }), false);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('PREVIOUSLY_SENT');
    });

    it('includes PREVIOUSLY_SENT when explicitly chosen for follow-up', () => {
      const result = decideEligibility(makeHistory({ hasSent: true }), true);
      expect(result.eligible).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('does not allow follow-up to override PENDING', () => {
      const result = decideEligibility(makeHistory({ hasSent: true, hasPending: true }), true);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('PENDING');
    });

    it('does not allow follow-up to override DELIVERY_UNKNOWN', () => {
      const result = decideEligibility(
        makeHistory({ hasSent: true, hasDeliveryUnknown: true }),
        true
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('DELIVERY_UNKNOWN');
    });

    it('FAILED/CANCELLED-only history is eligible', () => {
      const result = decideEligibility(makeHistory(), false);
      expect(result.eligible).toBe(true);
    });
  });

  describe('classifyForRowStatus', () => {
    it('returns ELIGIBLE for no history', () => {
      expect(classifyForRowStatus(makeHistory())).toBe('ELIGIBLE');
    });

    it('returns DELIVERY_UNKNOWN (highest precedence)', () => {
      expect(classifyForRowStatus(makeHistory({ hasDeliveryUnknown: true, hasSent: true, hasPending: true }))).toBe('DELIVERY_UNKNOWN');
    });

    it('returns PENDING over PREVIOUSLY_SENT', () => {
      expect(classifyForRowStatus(makeHistory({ hasPending: true, hasSent: true }))).toBe('PENDING');
    });

    it('returns PREVIOUSLY_SENT for sent-only history', () => {
      expect(classifyForRowStatus(makeHistory({ hasSent: true }))).toBe('PREVIOUSLY_SENT');
    });
  });

  describe('excludedByReason counting', () => {
    it('starts empty', () => {
      const counts = emptyExcludedByReason();
      expect(counts.duplicateAddress).toBe(0);
      expect(counts.previouslySent).toBe(0);
      expect(counts.pending).toBe(0);
      expect(counts.deliveryUnknown).toBe(0);
      expect(counts.missingValues).toBe(0);
    });

    it('increments the correct reason', () => {
      let counts = emptyExcludedByReason();
      counts = incrementReason(counts, 'DUPLICATE_ADDRESS');
      counts = incrementReason(counts, 'PREVIOUSLY_SENT');
      counts = incrementReason(counts, 'PREVIOUSLY_SENT');
      expect(counts.duplicateAddress).toBe(1);
      expect(counts.previouslySent).toBe(2);
    });

    it('does not mutate the original', () => {
      const original = emptyExcludedByReason();
      incrementReason(original, 'PENDING');
      expect(original.pending).toBe(0);
    });
  });

  it('has a policy version', () => {
    expect(POLICY_VERSION).toBe(1);
  });
});
