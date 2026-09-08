import { describe, it, expect } from 'vitest';
import {
  isReservedMergeFieldName,
  validateFieldName,
  generateTokenFromLabel,
  ensureUniqueToken,
  BUILTIN_MERGE_FIELD_NAMES,
  SYSTEM_RESERVED_TOKENS,
  LIMITS,
  FIELD_NAME_REGEX,
} from '@/lib/validation/merge-field-names';

describe('lib/validation/merge-field-names', () => {
  describe('isReservedMergeFieldName', () => {
    it('rejects built-in field names', () => {
      expect(isReservedMergeFieldName('name')).toBe(true);
      expect(isReservedMergeFieldName('email')).toBe(true);
      expect(isReservedMergeFieldName('company')).toBe(true);
      expect(isReservedMergeFieldName('job_title')).toBe(true);
      expect(isReservedMergeFieldName('first_name')).toBe(true);
      expect(isReservedMergeFieldName('notes')).toBe(true);
    });

    it('rejects system/database tokens', () => {
      expect(isReservedMergeFieldName('id')).toBe(true);
      expect(isReservedMergeFieldName('user_id')).toBe(true);
      expect(isReservedMergeFieldName('contact_id')).toBe(true);
      expect(isReservedMergeFieldName('campaign')).toBe(true);
      expect(isReservedMergeFieldName('date')).toBe(true);
      expect(isReservedMergeFieldName('unsubscribe')).toBe(true);
      expect(isReservedMergeFieldName('unsubscribe_url')).toBe(true);
    });

    it('rejects the _ prefix namespace', () => {
      expect(isReservedMergeFieldName('_internal')).toBe(true);
      expect(isReservedMergeFieldName('__proto__')).toBe(true);
      expect(isReservedMergeFieldName('_')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(isReservedMergeFieldName('NAME')).toBe(true);
      expect(isReservedMergeFieldName('Email')).toBe(true);
      expect(isReservedMergeFieldName('ID')).toBe(true);
    });

    it('allows non-reserved names', () => {
      expect(isReservedMergeFieldName('size')).toBe(false);
      expect(isReservedMergeFieldName('plan')).toBe(false);
      expect(isReservedMergeFieldName('t_shirt_size')).toBe(false);
      expect(isReservedMergeFieldName('birthdate')).toBe(false);
    });

    it('exports the lists for reuse', () => {
      expect(BUILTIN_MERGE_FIELD_NAMES).toContain('name');
      expect(SYSTEM_RESERVED_TOKENS).toContain('unsubscribe');
    });
  });

  describe('validateFieldName', () => {
    it('returns null for a valid token', () => {
      expect(validateFieldName('size')).toBeNull();
      expect(validateFieldName('t_shirt_size')).toBeNull();
      expect(validateFieldName('plan_2')).toBeNull();
    });

    it('rejects empty tokens', () => {
      expect(validateFieldName('')).not.toBeNull();
    });

    it('rejects tokens over MAX_FIELD_NAME_LENGTH', () => {
      const long = 'a'.repeat(LIMITS.MAX_FIELD_NAME_LENGTH + 1);
      expect(validateFieldName(long)).not.toBeNull();
    });

    it('rejects tokens that do not match the regex', () => {
      expect(validateFieldName('Size')).not.toBeNull(); // uppercase
      expect(validateFieldName('1size')).not.toBeNull(); // starts with digit
      expect(validateFieldName('size!')).not.toBeNull(); // special char
      expect(validateFieldName('size plan')).not.toBeNull(); // space
    });

    it('rejects reserved tokens', () => {
      expect(validateFieldName('name')).not.toBeNull();
      expect(validateFieldName('id')).not.toBeNull();
      expect(validateFieldName('unsubscribe')).not.toBeNull();
      expect(validateFieldName('_internal')).not.toBeNull();
    });
  });

  describe('FIELD_NAME_REGEX', () => {
    it('matches valid tokens', () => {
      expect(FIELD_NAME_REGEX.test('size')).toBe(true);
      expect(FIELD_NAME_REGEX.test('t_shirt_size')).toBe(true);
      expect(FIELD_NAME_REGEX.test('a1b2c3')).toBe(true);
    });

    it('rejects invalid tokens', () => {
      expect(FIELD_NAME_REGEX.test('Size')).toBe(false);
      expect(FIELD_NAME_REGEX.test('1size')).toBe(false);
      expect(FIELD_NAME_REGEX.test('size!')).toBe(false);
      expect(FIELD_NAME_REGEX.test('')).toBe(false);
    });
  });

  describe('generateTokenFromLabel', () => {
    it('lowercases and replaces non-alphanumeric with underscores', () => {
      expect(generateTokenFromLabel('T-shirt size')).toBe('t_shirt_size');
      expect(generateTokenFromLabel('Shoe Size')).toBe('shoe_size');
      expect(generateTokenFromLabel('Plan 2')).toBe('plan_2');
    });

    it('strips leading underscores and digits', () => {
      expect(generateTokenFromLabel('1st choice')).toBe('st_choice');
      expect(generateTokenFromLabel('  Size  ')).toBe('size');
    });

    it('truncates to MAX_FIELD_NAME_LENGTH', () => {
      const longLabel = 'a'.repeat(LIMITS.MAX_FIELD_NAME_LENGTH + 20);
      const token = generateTokenFromLabel(longLabel);
      expect(token.length).toBeLessThanOrEqual(LIMITS.MAX_FIELD_NAME_LENGTH);
    });

    it('returns empty string for labels with no usable characters', () => {
      expect(generateTokenFromLabel('')).toBe('');
      expect(generateTokenFromLabel('123')).toBe('');
      expect(generateTokenFromLabel('!!!')).toBe('');
    });
  });

  describe('ensureUniqueToken', () => {
    it('returns the token if it does not collide and is not reserved', () => {
      expect(ensureUniqueToken('size', ['plan'])).toBe('size');
    });

    it('appends _2, _3, … on collision with existing tokens', () => {
      expect(ensureUniqueToken('size', ['size'])).toBe('size_2');
      expect(ensureUniqueToken('size', ['size', 'size_2'])).toBe('size_3');
    });

    it('appends _2, _3, … on collision with reserved tokens', () => {
      expect(ensureUniqueToken('name', [])).toBe('name_2');
      expect(ensureUniqueToken('id', [])).toBe('id_2');
    });
  });

  describe('LIMITS', () => {
    it('exposes the documented defaults', () => {
      expect(LIMITS.MAX_CUSTOM_FIELDS_PER_USER).toBe(100);
      expect(LIMITS.MAX_CSV_COLUMNS).toBe(100);
      expect(LIMITS.MAX_CSV_ROWS).toBe(50_000);
      expect(LIMITS.MAX_FIELD_NAME_LENGTH).toBe(50);
      expect(LIMITS.MAX_FIELD_LABEL_LENGTH).toBe(100);
      expect(LIMITS.MAX_FIELD_VALUE_LENGTH).toBe(10_000);
    });
  });
});
