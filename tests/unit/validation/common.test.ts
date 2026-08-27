import { describe, it, expect } from 'vitest';
import { uuid, email, positiveInt, idParamSchema, paginationSchema } from '@/lib/validation/common';

describe('lib/validation/common', () => {
  describe('uuid', () => {
    it('accepts valid UUID', () => {
      expect(uuid.safeParse('123e4567-e89b-12d3-a456-426614174000').success).toBe(true);
    });

    it('rejects invalid UUID', () => {
      expect(uuid.safeParse('not-a-uuid').success).toBe(false);
    });
  });

  describe('email', () => {
    it('accepts valid email', () => {
      expect(email.safeParse('test@example.com').success).toBe(true);
    });

    it('rejects invalid email', () => {
      expect(email.safeParse('not-an-email').success).toBe(false);
    });
  });

  describe('positiveInt', () => {
    it('accepts positive integer', () => {
      expect(positiveInt.safeParse(1).success).toBe(true);
    });

    it('rejects zero', () => {
      expect(positiveInt.safeParse(0).success).toBe(false);
    });

    it('rejects negative', () => {
      expect(positiveInt.safeParse(-1).success).toBe(false);
    });
  });

  describe('idParamSchema', () => {
    it('accepts valid id param', () => {
      expect(idParamSchema.safeParse({ id: '123e4567-e89b-12d3-a456-426614174000' }).success).toBe(true);
    });

    it('rejects invalid id param', () => {
      expect(idParamSchema.safeParse({ id: 'invalid' }).success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('accepts default values', () => {
      expect(paginationSchema.safeParse({}).success).toBe(true);
    });

    it('rejects limit > 100', () => {
      expect(paginationSchema.safeParse({ limit: 101 }).success).toBe(false);
    });
  });
});
