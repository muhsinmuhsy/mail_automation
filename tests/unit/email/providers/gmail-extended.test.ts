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

function base64(input: string): string {
  return typeof btoa === 'function' ? btoa(input) : Buffer.from(input, 'utf-8').toString('base64');
}

interface Harness {
  provider: GmailProvider;
  written: string[];
}

function makeProvider(opts: {
  startTls: boolean;
  beforeTls?: string;
  afterTls?: string;
}): Harness {
  const written: string[] = [];
  const s1: SmtpSocket = { readable: makeReadable(opts.beforeTls ?? ''), writable: makeWritable(written) };
  const s2: SmtpSocket = { readable: makeReadable(opts.afterTls ?? ''), writable: makeWritable(written) };
  const socket: SmtpSocket = { ...s1, startTls: () => s2 };
  const factory: SocketFactory = { connect: () => socket };
  const provider = new GmailProvider({ socketFactory: factory, useStartTls: opts.startTls });
  return { provider, written };
}

const AUTH_REPLIES = '334 VXNlcm5hbWU6\r\n334 UGFzc3dvcmQ6\r\n235 2.7.0 Authentication successful\r\n';

describe('lib/email/providers/gmail (extended)', () => {
  describe('testConnection', () => {
    it('returns success on a clean EHLO + AUTH LOGIN', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n${AUTH_REPLIES}221 2.0.0 bye\r\n`,
      });
      const res = await provider.testConnection({ email: 'a@gmail.com', secret: 'pw' });
      expect(res.success).toBe(true);
      expect(res.provider).toBe('gmail');
      expect(res.message).toContain('successful');
    });

    it('returns failure when EHLO fails', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: '220 smtp ready\r\n550 EHLO rejected\r\n',
      });
      const res = await provider.testConnection({ email: 'a@gmail.com', secret: 'pw' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('EHLO failed');
    });

    it('returns failure when AUTH LOGIN is rejected up front', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: '220 smtp ready\r\n250 EHLO ok\r\n535 5.7.8 AUTH rejected\r\n',
      });
      const res = await provider.testConnection({ email: 'a@gmail.com', secret: 'pw' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('AUTH rejected');
    });

    it('returns failure when the username stage is rejected', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n334 VXNlcm5hbWU6\r\n535 5.7.8 username rejected\r\n`,
      });
      const res = await provider.testConnection({ email: 'a@gmail.com', secret: 'pw' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('Username rejected');
    });

    it('returns failure when the password stage is rejected', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n334 VXNlcm5hbWU6\r\n334 UGFzc3dvcmQ6\r\n535 5.7.8 password rejected\r\n`,
      });
      const res = await provider.testConnection({ email: 'a@gmail.com', secret: 'pw' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('Password rejected');
    });

    it('returns failure when the socket connect throws', async () => {
      const factory: SocketFactory = {
        connect: () => {
          throw new Error('boom');
        },
      };
      const provider = new GmailProvider({ socketFactory: factory, useStartTls: false });
      const res = await provider.testConnection({ email: 'a@gmail.com', secret: 'pw' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('boom');
    });
  });

  describe('constructor defaults', () => {
    it('falls back to the default socket factory and surfaces connect failure', async () => {
      const provider = new GmailProvider(); // no options -> uses defaultSocketFactory
      const res = await provider.testConnection({ email: 'a@gmail.com', secret: 'pw' });
      expect(res.success).toBe(false);
      expect(res.message).toContain('No TCP connect');
    });
  });

  describe('sendEmail (implicit TLS / no STARTTLS)', () => {
    const SUCCESS = `220 smtp ready\r\n250 EHLO ok\r\n${AUTH_REPLIES}250 2.1.0 MAIL FROM\r\n250 2.1.5 RCPT TO\r\n354 Go ahead\r\n250 2.0.0 queued\r\n221 2.0.0 bye\r\n`;

    it('sends successfully and uses AUTH LOGIN base64 credentials', async () => {
      const { provider, written } = makeProvider({ startTls: false, beforeTls: SUCCESS });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'Hello',
        mimeMessage: 'From: sender@gmail.com\r\n\r\nHello',
        credentials: { email: 'sender@gmail.com', secret: 'app-pass' },
      });
      expect(res.success).toBe(true);
      const transcript = written.join('');
      expect(transcript).toContain(base64('sender@gmail.com'));
      expect(transcript).toContain(base64('app-pass'));
      // Credentials must never appear in plaintext on the wire.
      expect(transcript).not.toContain('app-pass');
    });

    it('returns a permanent error when authentication is rejected', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n334 VXNlcm5hbWU6\r\n334 UGFzc3dvcmQ6\r\n535 5.7.8 Authentication failed\r\n`,
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'wrong' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('permanent');
    });

    it('classifies an invalid recipient (5xx RCPT) as permanent', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n${AUTH_REPLIES}250 MAIL\r\n550 5.1.1 mailbox unavailable\r\n`,
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'nobody@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('permanent');
    });

    it('classifies a temporary recipient failure (4xx RCPT) as temporary', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n${AUTH_REPLIES}250 MAIL\r\n450 4.2.1 mailbox busy\r\n`,
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'busy@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('temporary');
    });

    it('classifies a permanent DATA failure (5xx) as permanent', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n${AUTH_REPLIES}250 MAIL\r\n250 RCPT\r\n554 5.7.1 rejected\r\n`,
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('permanent');
    });

    it('classifies a temporary DATA failure (4xx) as temporary', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n${AUTH_REPLIES}250 MAIL\r\n250 RCPT\r\n451 4.3.0 try later\r\n`,
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('temporary');
    });

    it('throws an SmtpError-style permanent failure when EHLO is rejected', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: '550 5.7.1 EHLO rejected up front\r\n',
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('permanent');
    });

    it('throws a permanent failure when EHLO returns a failure code inside sendEmail', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: '220 smtp ready\r\n550 5.7.1 EHLO denied\r\n',
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('permanent');
    });

    it('classifies a permanent failure after DATA is accepted (5xx final reply)', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n${AUTH_REPLIES}250 MAIL\r\n250 RCPT\r\n354 Go ahead\r\n554 5.7.1 data rejected\r\n`,
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('permanent');
    });

    it('classifies a temporary failure after DATA is accepted (4xx final reply)', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n${AUTH_REPLIES}250 MAIL\r\n250 RCPT\r\n354 Go ahead\r\n451 4.3.0 try later\r\n`,
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('temporary');
    });

    it('classifies a >=600 MAIL FROM code as temporary (boundary classification)', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n${AUTH_REPLIES}600 6.0.0 weird code\r\n`,
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('temporary');
    });

    it('throws a permanent failure when MAIL FROM is rejected', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n${AUTH_REPLIES}550 5.7.1 sender rejected\r\n`,
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('permanent');
    });

    it('returns a permanent error when the credentials object is absent', async () => {
      const { provider } = makeProvider({ startTls: false, beforeTls: SUCCESS });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: undefined as unknown as { email: string; secret: string },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('permanent');
      expect(res.error).toBe('Missing credentials.');
    });

    it('classifies a >=600 RCPT code as temporary (boundary classification)', async () => {
      const { provider } = makeProvider({
        startTls: false,
        beforeTls: `220 smtp ready\r\n250 EHLO ok\r\n${AUTH_REPLIES}250 MAIL\r\n600 6.0.0 weird rcpt code\r\n`,
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('temporary');
    });

    it('returns a permanent error when credentials are missing', async () => {
      const { provider } = makeProvider({ startTls: false, beforeTls: SUCCESS });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: '', secret: '' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('permanent');
      expect(res.error).toBe('Missing credentials.');
    });

    it('sends a message that includes an attachment part in the MIME payload', async () => {
      const { provider, written } = makeProvider({ startTls: false, beforeTls: SUCCESS });
      const mime = buildMimeMessage({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'Hello',
        attachments: [{ filename: 'resume.pdf', content: new TextEncoder().encode('PDF'), contentType: 'application/pdf' }],
      });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'Hello',
        mimeMessage: mime,
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(true);
      expect(written.join('')).toContain('Content-Disposition: attachment; filename="resume.pdf"');
    });

    it('maps an unexpected non-SMTP error to a temporary failure', async () => {
      const broken: SmtpSocket = {
        readable: new ReadableStream({
          pull() {
            throw new Error('network down');
          },
        }),
        writable: makeWritable([]),
      };
      const factory: SocketFactory = { connect: () => broken };
      const provider = new GmailProvider({ socketFactory: factory, useStartTls: false });
      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'b',
        mimeMessage: 'x',
        credentials: { email: 'sender@gmail.com', secret: 'pw' },
      });
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('temporary');
      expect(res.error).toContain('network down');
    });
  });

  describe('sendEmail (STARTTLS primary production path)', () => {
    it('connects on 587, upgrades via STARTTLS, and delivers successfully', async () => {
      const beforeTls = '220 smtp.gmail.com ESMTP ready\r\n250-mail.example.com\r\n250 STARTTLS\r\n220 2.0.0 Ready to start TLS\r\n';
      const afterTls = `250-mail.example.com\r\n250 AUTH LOGIN\r\n${AUTH_REPLIES}250 MAIL\r\n250 RCPT\r\n354 Go ahead\r\n250 2.0.0 queued\r\n221 bye\r\n`;
      const { provider, written } = makeProvider({ startTls: true, beforeTls, afterTls });

      const res = await provider.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'Hello',
        mimeMessage: 'From: sender@gmail.com\r\n\r\nHello',
        credentials: { email: 'sender@gmail.com', secret: 'app-pass' },
      });

      expect(res.success).toBe(true);
      const transcript = written.join('');
      expect(transcript).toContain('STARTTLS');
      // After upgrade the client re-issues EHLO over the TLS socket.
      expect(transcript).toContain('EHLO');
      expect(transcript).not.toContain('app-pass');
    });
  });
});
