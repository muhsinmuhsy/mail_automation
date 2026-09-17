import { describe, it, expect } from 'vitest';
import {
  LIMIT_ERROR_CODES,
  TRANSIENT_ERROR_CODES,
  isLimitError,
  isTransientError,
  stripErrorCode,
} from '@/lib/limits/error-codes';

describe('lib/limits/error-codes', () => {
  describe('isLimitError', () => {
    it('matches SYSTEM_DAILY_LIMIT code prefix', () => {
      expect(isLimitError(`${LIMIT_ERROR_CODES.SYSTEM} System daily limit reached (500 of 500).`)).toBe(true);
    });

    it('matches ACCOUNT_DAILY_LIMIT code prefix', () => {
      expect(isLimitError(`${LIMIT_ERROR_CODES.ACCOUNT} Account daily limit reached (20 of 20).`)).toBe(true);
    });

    it('matches CAMPAIGN_DAILY_LIMIT code prefix', () => {
      expect(isLimitError(`${LIMIT_ERROR_CODES.CAMPAIGN} Campaign daily limit reached (2 of 2).`)).toBe(true);
    });

    it('matches legacy "Daily email limit reached" string', () => {
      expect(isLimitError('Daily email limit reached.')).toBe(true);
    });

    it('does NOT match QUOTA_TRANSACTION_CONFLICT (transient, not limit)', () => {
      expect(isLimitError(`${TRANSIENT_ERROR_CODES.QUOTA_CONFLICT} Could not reserve.`)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isLimitError(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isLimitError(undefined)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isLimitError('')).toBe(false);
    });

    it('returns false for unrelated error messages', () => {
      expect(isLimitError('Email sending is currently disabled.')).toBe(false);
      expect(isLimitError('User account is inactive.')).toBe(false);
      expect(isLimitError('Some random error')).toBe(false);
    });
  });

  describe('isTransientError', () => {
    it('matches QUOTA_TRANSACTION_CONFLICT code prefix', () => {
      expect(isTransientError(`${TRANSIENT_ERROR_CODES.QUOTA_CONFLICT} Could not reserve.`)).toBe(true);
    });

    it('does NOT match limit error codes', () => {
      expect(isTransientError(`${LIMIT_ERROR_CODES.SYSTEM} System daily limit reached.`)).toBe(false);
      expect(isTransientError(`${LIMIT_ERROR_CODES.ACCOUNT} Account daily limit reached.`)).toBe(false);
      expect(isTransientError(`${LIMIT_ERROR_CODES.CAMPAIGN} Campaign daily limit reached.`)).toBe(false);
    });

    it('returns false for null', () => {
      expect(isTransientError(null)).toBe(false);
    });

    it('returns false for legacy limit message', () => {
      expect(isTransientError('Daily email limit reached.')).toBe(false);
    });
  });

  describe('stripErrorCode', () => {
    it('removes SYSTEM_DAILY_LIMIT code prefix', () => {
      const message = `${LIMIT_ERROR_CODES.SYSTEM} System daily limit reached (500 of 500). Try again tomorrow.`;
      expect(stripErrorCode(message)).toBe('System daily limit reached (500 of 500). Try again tomorrow.');
    });

    it('removes ACCOUNT_DAILY_LIMIT code prefix', () => {
      const message = `${LIMIT_ERROR_CODES.ACCOUNT} Account daily limit reached (20 of 20). Resets at midnight UTC.`;
      expect(stripErrorCode(message)).toBe('Account daily limit reached (20 of 20). Resets at midnight UTC.');
    });

    it('removes CAMPAIGN_DAILY_LIMIT code prefix', () => {
      const message = `${LIMIT_ERROR_CODES.CAMPAIGN} Campaign daily limit reached (2 of 2). Resets at midnight UTC.`;
      expect(stripErrorCode(message)).toBe('Campaign daily limit reached (2 of 2). Resets at midnight UTC.');
    });

    it('removes QUOTA_TRANSACTION_CONFLICT code prefix', () => {
      const message = `${TRANSIENT_ERROR_CODES.QUOTA_CONFLICT} Could not reserve email capacity.`;
      expect(stripErrorCode(message)).toBe('Could not reserve email capacity.');
    });

    it('leaves legacy messages unchanged (no code prefix)', () => {
      expect(stripErrorCode('Daily email limit reached.')).toBe('Daily email limit reached.');
    });

    it('leaves unrelated messages unchanged', () => {
      expect(stripErrorCode('User account is inactive.')).toBe('User account is inactive.');
    });

    it('returns empty string for null', () => {
      expect(stripErrorCode(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(stripErrorCode(undefined)).toBe('');
    });
  });
});
