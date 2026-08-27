import { describe, it, expect } from 'vitest';
import { createContactSchema, updateContactSchema } from '@/lib/validation/contact';

describe('lib/validation/contact', () => {
  describe('createContactSchema', () => {
    it('accepts valid input', () => {
      expect(() =>
        createContactSchema.parse({
          name: 'John Doe',
          email: 'john@example.com',
          company: 'Acme',
          job_title: 'Engineer',
          notes: 'Met at conference',
        })
      ).not.toThrow();
    });

    it('accepts input without optional fields', () => {
      expect(() =>
        createContactSchema.parse({
          name: 'John Doe',
          email: 'john@example.com',
        })
      ).not.toThrow();
    });

    it('rejects empty name', () => {
      expect(() =>
        createContactSchema.parse({
          name: '',
          email: 'john@example.com',
        })
      ).toThrow();
    });

    it('rejects invalid email', () => {
      expect(() =>
        createContactSchema.parse({
          name: 'John Doe',
          email: 'not-an-email',
        })
      ).toThrow();
    });
  });

  describe('updateContactSchema', () => {
    it('accepts partial valid input', () => {
      expect(() =>
        updateContactSchema.parse({
          name: 'Jane Doe',
          company: 'Acme',
        })
      ).not.toThrow();
    });

    it('accepts empty object', () => {
      expect(() => updateContactSchema.parse({})).not.toThrow();
    });
  });
});
