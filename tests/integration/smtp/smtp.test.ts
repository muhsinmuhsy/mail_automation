import { describe, it, expect } from 'vitest';
import { GmailProvider } from '@/lib/email/providers/gmail';
import { buildMimeMessage } from '@/lib/email/mime';
import type { SocketFactory, SmtpSocket } from '@/lib/email/providers/smtp/transport';

function makeReadable(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function makeWritable(log: string[]): WritableStream<Uint8Array> {
  return new WritableStream({
    write(chunk) {
      log.push(new TextDecoder().decode(chunk));
    },
  });
}

function decodeBase64(input: string): string {
  return typeof atob === 'function' ? atob(input) : Buffer.from(input, 'base64').toString('utf-8');
}

const SUCCESS_REPLIES =
  '220 smtp ready\r\n' +
  '250 EHLO ok\r\n' +
  '334 VXNlcm5hbWU6\r\n' +
  '334 UGFzc3dvcmQ6\r\n' +
  '235 2.7.0 Authenticated\r\n' +
  '250 2.1.0 MAIL FROM\r\n' +
  '250 2.1.5 RCPT TO\r\n' +
  '354 Go ahead\r\n' +
  '250 2.0.0 queued\r\n' +
  '221 2.0.0 bye\r\n';

describe('integration/smtp MIME structure + transport', () => {
  it('transmits a well-formed multipart MIME message with a PDF attachment and no plaintext credentials', async () => {
    const written: string[] = [];
    const socket: SmtpSocket = { readable: makeReadable(SUCCESS_REPLIES), writable: makeWritable(written) };
    const factory: SocketFactory = { connect: () => socket };
    const provider = new GmailProvider({ socketFactory: factory, useStartTls: false });

    const secret = 'super-secret-app-password';
    const pdf = new TextEncoder().encode('%PDF-1.4 fake pdf binary content here');
    const bodyText = 'Please find my resume attached.';

    const mime = buildMimeMessage({
      from: 'sender@gmail.com',
      to: 'rcpt@example.com',
      subject: 'My Resume',
      body: bodyText,
      attachments: [{ filename: 'resume.pdf', content: pdf, contentType: 'application/pdf' }],
    });

    const result = await provider.sendEmail({
      from: 'sender@gmail.com',
      to: 'rcpt@example.com',
      subject: 'My Resume',
      body: bodyText,
      mimeMessage: mime,
      credentials: { email: 'sender@gmail.com', secret },
    });

    expect(result.success).toBe(true);
    const transcript = written.join('');

    // Isolate the DATA payload (between DATA command and the end-of-data marker).
    const dataIdx = transcript.indexOf('DATA\r\n');
    expect(dataIdx).toBeGreaterThan(-1);
    const afterData = transcript.slice(dataIdx + 'DATA\r\n'.length);
    const endIdx = afterData.indexOf('\r\n.\r\n');
    expect(endIdx).toBeGreaterThan(-1);
    const payload = afterData.slice(0, endIdx);

    // Header assertions.
    expect(payload).toContain('From: sender@gmail.com');
    expect(payload).toContain('To: rcpt@example.com');
    expect(payload).toContain('Subject: My Resume');
    expect(payload).toContain('MIME-Version: 1.0');

    // Multipart structure.
    expect(payload).toContain('Content-Type: multipart/mixed;');
    const boundaryMatch = payload.match(/boundary="([^"]+)"/);
    expect(boundaryMatch).not.toBeNull();
    const boundary = boundaryMatch![1];
    expect(payload).toContain(`--${boundary}`);
    expect(payload).toContain(`--${boundary}--`);

    // Split into parts and decode each.
    const parts = payload
      .split(`--${boundary}`)
      .slice(1)
      .filter((p) => p && !p.startsWith('--'));

    const decodePart = (part: string): string => {
      const headerEnd = part.indexOf('\r\n\r\n');
      const b64 = part.slice(headerEnd + 4).replace(/\r\n/g, '');
      return decodeBase64(b64);
    };

    const bodyPart = parts.find((p) => p.includes('text/plain'));
    const attachPart = parts.find((p) => p.includes('filename="resume.pdf"'));

    expect(bodyPart).toBeDefined();
    expect(attachPart).toBeDefined();

    expect(decodePart(bodyPart!)).toBe(bodyText);
    expect(decodePart(attachPart!)).toBe('%PDF-1.4 fake pdf binary content here');

    // Attachment-specific headers.
    expect(attachPart).toContain('Content-Type: application/pdf');
    expect(attachPart).toContain('Content-Disposition: attachment; filename="resume.pdf"');
    expect(attachPart).toContain('Content-Transfer-Encoding: base64');

    // Credential safety: the secret must never appear in plaintext anywhere on
    // the wire (it is only sent base64-encoded via AUTH LOGIN, which is expected).
    expect(transcript).not.toContain(secret);
  });
});
