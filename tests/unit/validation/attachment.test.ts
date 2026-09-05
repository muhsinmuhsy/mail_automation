import { describe, it, expect } from 'vitest';
import { createAttachmentSchema, setDefaultAttachmentSchema } from '@/lib/validation/attachment';

const MB = 1024 * 1024;

describe('lib/validation/attachment', () => {
  describe('createAttachmentSchema', () => {
    it('accepts a valid attachment upload', () => {
      const r = createAttachmentSchema.parse({ filename: 'attachment.pdf', mimeType: 'application/pdf', sizeBytes: 1024 });
      expect(r.filename).toBe('attachment.pdf');
      expect(r.mimeType).toBe('application/pdf');
      expect(r.sizeBytes).toBe(1024);
    });

    it('defaults mimeType to application/pdf', () => {
      const r = createAttachmentSchema.parse({ filename: 'r.pdf', sizeBytes: 10 });
      expect(r.mimeType).toBe('application/pdf');
    });

    it('accepts exactly 5MB and rejects 5MB + 1 byte', () => {
      expect(() => createAttachmentSchema.parse({ filename: 'r.pdf', sizeBytes: 5 * MB })).not.toThrow();
      expect(() => createAttachmentSchema.parse({ filename: 'r.pdf', sizeBytes: 5 * MB + 1 })).toThrow();
    });

    it('rejects zero, negative and non-integer sizes', () => {
      expect(() => createAttachmentSchema.parse({ filename: 'r.pdf', sizeBytes: 0 })).toThrow();
      expect(() => createAttachmentSchema.parse({ filename: 'r.pdf', sizeBytes: -1 })).toThrow();
      expect(() => createAttachmentSchema.parse({ filename: 'r.pdf', sizeBytes: 1.5 })).toThrow();
    });

    it('rejects overly long filenames at the 255 boundary', () => {
      expect(() => createAttachmentSchema.parse({ filename: 'a'.repeat(255), sizeBytes: 1 })).not.toThrow();
      expect(() => createAttachmentSchema.parse({ filename: 'a'.repeat(256), sizeBytes: 1 })).toThrow();
    });

    it('rejects overly long mime types', () => {
      expect(() => createAttachmentSchema.parse({ filename: 'r.pdf', mimeType: 'x'.repeat(101), sizeBytes: 1 })).toThrow();
    });

    // SOURCE GAP: the schema does not enforce a PDF extension or a
    // application/pdf content type, and does not require a non-empty filename.
    // These document the current (permissive) behaviour; tighten the schema in
    // source if enforcement is required.
    it('NOTE: currently accepts non-PDF mime types and empty filenames (source gap)', () => {
      expect(() =>
        createAttachmentSchema.parse({ filename: 'attachment.txt', mimeType: 'text/plain', sizeBytes: 1 }),
      ).not.toThrow();
      expect(() => createAttachmentSchema.parse({ filename: '', sizeBytes: 1 })).not.toThrow();
    });
  });

  describe('setDefaultAttachmentSchema', () => {
    it('accepts a valid uuid', () => {
      expect(() => setDefaultAttachmentSchema.parse({ attachment_id: crypto.randomUUID() })).not.toThrow();
    });

    it('rejects an invalid uuid', () => {
      expect(() => setDefaultAttachmentSchema.parse({ attachment_id: 'bad' })).toThrow();
    });
  });
});
