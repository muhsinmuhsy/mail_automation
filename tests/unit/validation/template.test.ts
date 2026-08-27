import { describe, it, expect } from 'vitest';
import { createTemplateSchema, updateTemplateSchema } from '@/lib/validation/template';

describe('lib/validation/template', () => {
  describe('createTemplateSchema', () => {
    it('accepts valid input', () => {
      expect(() =>
        createTemplateSchema.parse({
          name: 'Follow-up',
          subject: 'Hello {{name}}',
          body: 'Dear {{name}},\n\nThank you for your time.',
        })
      ).not.toThrow();
    });

    it('rejects empty name', () => {
      expect(() =>
        createTemplateSchema.parse({
          name: '',
          subject: 'Hello',
          body: 'Body',
        })
      ).toThrow();
    });

    it('rejects name exceeding 100 chars', () => {
      expect(() =>
        createTemplateSchema.parse({
          name: 'a'.repeat(101),
          subject: 'Hello',
          body: 'Body',
        })
      ).toThrow();
    });

    it('rejects subject exceeding 200 chars', () => {
      expect(() =>
        createTemplateSchema.parse({
          name: 'Follow-up',
          subject: 'a'.repeat(201),
          body: 'Body',
        })
      ).toThrow();
    });
  });

  describe('updateTemplateSchema', () => {
    it('accepts partial valid input', () => {
      expect(() =>
        updateTemplateSchema.parse({
          subject: 'New subject',
          body: 'New body',
        })
      ).not.toThrow();
    });

    it('accepts empty object', () => {
      expect(() => updateTemplateSchema.parse({})).not.toThrow();
    });
  });
});
