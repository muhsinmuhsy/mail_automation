import { describe, it, expect } from 'vitest';
import {
  buildMimeMessage,
  encodeRfc2047,
  dotStuff,
  formatMailboxAddress,
  type Attachment,
} from '@/lib/email/mime';

function decodeBase64(input: string): string {
  return typeof atob === 'function'
    ? atob(input)
    : Buffer.from(input, 'base64').toString('utf-8');
}

const sampleAttachment: Attachment = {
  filename: 'resume.pdf',
  content: new TextEncoder().encode('PDFDATA'),
  contentType: 'application/pdf',
};

describe('lib/email/mime', () => {
  it('encodes non-ASCII subjects with RFC 2047 and keeps ASCII intact', () => {
    expect(encodeRfc2047('Hello')).toBe('Hello');
    const encoded = encodeRfc2047('Héllo Wörld');
    expect(encoded).toMatch(/^=\?UTF-8\?B\?/);
  });

  it('rejects header injection attempts', () => {
    const mime = buildMimeMessage({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 'Hi\r\nBcc: evil@x.com',
      body: 'body',
    });
    expect(mime).not.toMatch(/\r\nBcc:/);
  });

  it('sanitizes header values (no embedded CR/LF)', () => {
    const mime = buildMimeMessage({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 'Subject\nInjected: yes',
      body: 'body',
    });
    const subjectLine = mime.split('\r\n').find((l) => l.startsWith('Subject:'));
    expect(subjectLine).toBe('Subject: SubjectInjected: yes');
  });

  it('produces a single-part message with base64 body by default', () => {
    const mime = buildMimeMessage({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 'Test',
      body: 'Hello world',
    });
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(mime).toContain('Content-Transfer-Encoding: base64');
    const base64Part = mime.split('\r\n\r\n')[1];
    expect(decodeBase64(base64Part.trim())).toBe('Hello world');
  });

  it('builds multipart/mixed when an attachment is present', () => {
    const mime = buildMimeMessage({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 'Test',
      body: 'Hello',
      attachments: [sampleAttachment],
    });
    expect(mime).toContain('Content-Type: multipart/mixed;');
    expect(mime).toContain('Content-Disposition: attachment; filename="resume.pdf"');
    expect(mime).toContain('application/pdf');
    expect(mime).toContain('--');
  });

  it('dot-stuffing prefixes leading dots and terminates data', () => {
    const stuffed = dotStuff('line one\r\n.line two\r\nend');
    expect(stuffed).toBe('line one\r\n..line two\r\nend');
  });

  it('formats mailbox addresses with RFC 2047 encoded display names', () => {
    expect(formatMailboxAddress('John', 'john@x.com')).toBe('John <john@x.com>');
    expect(formatMailboxAddress('Jön', 'j@x.com')).toMatch(/=\?UTF-8\?B\?/);
  });

  it('builds multipart/alternative with text+html when bodyHtml is present', () => {
    const mime = buildMimeMessage({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 'Test',
      body: 'Hello world',
      bodyHtml: '<p>Hello <b>world</b></p>',
    });
    expect(mime).toContain('Content-Type: multipart/alternative;');
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
  });

  it('builds nested multipart/mixed > multipart/alternative with attachments + bodyHtml', () => {
    const mime = buildMimeMessage({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 'Test',
      body: 'Hello',
      bodyHtml: '<p>Hello</p>',
      attachments: [sampleAttachment],
    });
    expect(mime).toContain('Content-Type: multipart/mixed;');
    expect(mime).toContain('Content-Type: multipart/alternative;');
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"');
    expect(mime).toContain('Content-Disposition: attachment; filename="resume.pdf"');
  });

  it('keeps single-part text/plain when bodyHtml is absent (legacy)', () => {
    const mime = buildMimeMessage({
      from: 'a@b.com',
      to: 'c@d.com',
      subject: 'Test',
      body: 'Hello world',
    });
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(mime).not.toContain('multipart/alternative');
  });
});
