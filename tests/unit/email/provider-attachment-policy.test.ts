import { describe, expect, it } from 'vitest';
import { getAttachmentPolicy } from '@/lib/email/providers/attachment-policies';
import { attachmentSelectionError } from '@/lib/email/attachment-limits';
import { ENABLED_PROVIDERS } from '@/lib/email/providers/registry';
import { attachmentContentType, validAttachmentFormat } from '@/lib/attachments/file-types';

describe('provider attachment boundaries', () => {
  it('configures only Gmail and refuses to inherit its rules for future providers', () => {
    expect([...ENABLED_PROVIDERS]).toEqual(['gmail']);
    expect(getAttachmentPolicy('gmail')?.provider).toBe('gmail');
    for (const provider of ['microsoft', 'yahoo', 'custom_smtp', 'unknown', '__proto__']) {
      expect(getAttachmentPolicy(provider)).toBeNull();
      expect(attachmentSelectionError([], provider)).toMatch(/not configured/);
    }
  });
  it('enforces the Gmail per-file sending limit', () => {
    expect(attachmentSelectionError([{ size_bytes: 5 * 1024 * 1024 + 1 }], 'gmail')).toMatch(/Each attachment/);
  });
  it.each([
    ['notes.txt', 'Hello', 'text/plain'], ['contacts.csv', 'name,email', 'text/csv'],
    ['file.pdf', '%PDF-1.7', 'application/pdf'], ['letter.rtf', '{\\rtf1 Hello}', 'application/rtf'],
    ['slide.pptx', 'PK\x03\x04contents', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ])('accepts %s and generates the correct MIME type', (name, bytes, mime) => {
    expect(validAttachmentFormat(name, new TextEncoder().encode(bytes))).toBe(true);
    expect(attachmentContentType(name)).toBe(mime);
  });
  it('accepts image signatures and rejects renamed or unsupported binaries', () => {
    expect(validAttachmentFormat('image.PNG', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    for (const name of ['fake.pdf', 'fake.png', 'script.exe', 'script.js', 'archive.zip']) {
      expect(validAttachmentFormat(name, new TextEncoder().encode('not valid'))).toBe(false);
    }
  });
});
