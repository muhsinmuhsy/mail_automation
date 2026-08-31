import { describe, it, expect } from 'vitest';
import { createResumeSchema, setDefaultResumeSchema } from '@/lib/validation/resume';

const MB = 1024 * 1024;

describe('lib/validation/resume', () => {
  describe('createResumeSchema', () => {
    it('accepts a valid resume upload', () => {
      const r = createResumeSchema.parse({ filename: 'resume.pdf', mimeType: 'application/pdf', sizeBytes: 1024 });
      expect(r.filename).toBe('resume.pdf');
      expect(r.mimeType).toBe('application/pdf');
      expect(r.sizeBytes).toBe(1024);
    });

    it('defaults mimeType to application/pdf', () => {
      const r = createResumeSchema.parse({ filename: 'r.pdf', sizeBytes: 10 });
      expect(r.mimeType).toBe('application/pdf');
    });

    it('accepts exactly 5MB and rejects 5MB + 1 byte', () => {
      expect(() => createResumeSchema.parse({ filename: 'r.pdf', sizeBytes: 5 * MB })).not.toThrow();
      expect(() => createResumeSchema.parse({ filename: 'r.pdf', sizeBytes: 5 * MB + 1 })).toThrow();
    });

    it('rejects zero, negative and non-integer sizes', () => {
      expect(() => createResumeSchema.parse({ filename: 'r.pdf', sizeBytes: 0 })).toThrow();
      expect(() => createResumeSchema.parse({ filename: 'r.pdf', sizeBytes: -1 })).toThrow();
      expect(() => createResumeSchema.parse({ filename: 'r.pdf', sizeBytes: 1.5 })).toThrow();
    });

    it('rejects overly long filenames at the 255 boundary', () => {
      expect(() => createResumeSchema.parse({ filename: 'a'.repeat(255), sizeBytes: 1 })).not.toThrow();
      expect(() => createResumeSchema.parse({ filename: 'a'.repeat(256), sizeBytes: 1 })).toThrow();
    });

    it('rejects overly long mime types', () => {
      expect(() => createResumeSchema.parse({ filename: 'r.pdf', mimeType: 'x'.repeat(101), sizeBytes: 1 })).toThrow();
    });

    // SOURCE GAP: the schema does not enforce a PDF extension or a
    // application/pdf content type, and does not require a non-empty filename.
    // These document the current (permissive) behaviour; tighten the schema in
    // source if enforcement is required.
    it('NOTE: currently accepts non-PDF mime types and empty filenames (source gap)', () => {
      expect(() =>
        createResumeSchema.parse({ filename: 'resume.txt', mimeType: 'text/plain', sizeBytes: 1 }),
      ).not.toThrow();
      expect(() => createResumeSchema.parse({ filename: '', sizeBytes: 1 })).not.toThrow();
    });
  });

  describe('setDefaultResumeSchema', () => {
    it('accepts a valid uuid', () => {
      expect(() => setDefaultResumeSchema.parse({ resume_id: crypto.randomUUID() })).not.toThrow();
    });

    it('rejects an invalid uuid', () => {
      expect(() => setDefaultResumeSchema.parse({ resume_id: 'bad' })).toThrow();
    });
  });
});
