import { describe, it, expect } from 'vitest';
import {
  uuid,
  email,
  positiveInt,
  nonEmptyString,
  maxLength,
  paginationSchema,
  sortSchema,
  idParamSchema,
} from '@/lib/validation/common';

describe('lib/validation/common', () => {
  describe('uuid', () => {
    it('accepts valid UUIDs', () => {
      expect(() => uuid.parse('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
    });

    it('rejects invalid UUIDs', () => {
      expect(() => uuid.parse('not-a-uuid')).toThrow();
    });
  });

  describe('email', () => {
    it('accepts valid emails', () => {
      expect(() => email.parse('test@example.com')).not.toThrow();
    });

    it('rejects invalid emails', () => {
      expect(() => email.parse('not-an-email')).toThrow();
    });
  });

  describe('positiveInt', () => {
    it('accepts positive integers', () => {
      expect(() => positiveInt.parse(1)).not.toThrow();
    });

    it('rejects zero', () => {
      expect(() => positiveInt.parse(0)).toThrow();
    });

    it('rejects negative numbers', () => {
      expect(() => positiveInt.parse(-1)).toThrow();
    });

    it('rejects non-integers', () => {
      expect(() => positiveInt.parse(1.5)).toThrow();
    });
  });

  describe('nonEmptyString', () => {
    it('accepts non-empty strings', () => {
      expect(() => nonEmptyString.parse('hello')).not.toThrow();
    });

    it('rejects empty strings', () => {
      expect(() => nonEmptyString.parse('')).toThrow();
    });
  });

  describe('maxLength', () => {
    it('accepts strings within max length', () => {
      expect(() => maxLength(5).parse('hello')).not.toThrow();
    });

    it('rejects strings exceeding max length', () => {
      expect(() => maxLength(5).parse('hello world')).toThrow();
    });
  });

  describe('paginationSchema', () => {
    it('applies defaults', () => {
      const result = paginationSchema.parse({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('accepts valid values', () => {
      const result = paginationSchema.parse({ page: 2, limit: 10 });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });

    it('rejects limit over 100', () => {
      expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
    });
  });

  describe('sortSchema', () => {
    it('applies defaults', () => {
      const result = sortSchema.parse({});
      expect(result.sortOrder).toBe('asc');
    });

    it('accepts valid sort orders', () => {
      expect(() => sortSchema.parse({ sortOrder: 'desc' })).not.toThrow();
    });

    it('rejects invalid sort orders', () => {
      expect(() => sortSchema.parse({ sortOrder: 'invalid' })).toThrow();
    });
  });

  describe('idParamSchema', () => {
    it('accepts valid ID', () => {
      expect(() => idParamSchema.parse({ id: '550e8400-e29b-41d4-a716-446655440000' })).not.toThrow();
    });

    it('rejects invalid ID', () => {
      expect(() => idParamSchema.parse({ id: 'invalid' })).toThrow();
    });
  });
});
