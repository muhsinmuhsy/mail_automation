import { describe, it, expect, vi } from 'vitest';
import { GmailProvider } from '@/lib/email/providers/gmail';
import { EmailProviderFactory } from '@/lib/email/providers/factory';

describe('lib/email/providers/gmail', () => {
  const provider = new GmailProvider();

  describe('getCapabilities', () => {
    it('should return correct capabilities', () => {
      const caps = provider.getCapabilities();
      expect(caps.supportsOAuth2).toBe(false);
      expect(caps.supportsAppPassword).toBe(true);
      expect(caps.supportsPassword).toBe(false);
      expect(caps.supportsAttachments).toBe(true);
    });
  });

  describe('testConnection', () => {
    it('should return failure when credentials are missing', async () => {
      const result = await provider.testConnection({ email: '', secret: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('sendEmail', () => {
    it('should return failure when credentials are missing', async () => {
      const result = await provider.sendEmail({
        from: 'test@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        body: 'Hello',
        mimeMessage: 'test',
        credentials: { email: '', secret: '' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing credentials.');
    });
  });

  describe('STARTTLS primary production path', () => {
    it('connects on port 587 and upgrades the socket via STARTTLS', async () => {
      const replies = [
        '220 smtp.gmail.com ESMTP ready',
        '250-mail.example.com',
        '250 STARTTLS',
        '220 2.0.0 Ready to start TLS',
        '250-mail.example.com',
        '250 AUTH LOGIN',
        '334 VXNlcm5hbWU6',
        '334 UGFzc3dvcmQ6',
        '235 2.7.0 Authentication successful',
        '250 2.1.0 OK MAIL FROM',
        '250 2.1.5 OK RCPT TO',
        '354 Go ahead',
        '250 2.0.0 OK queued',
        '221 2.0.0 bye',
      ];
      let idx = 0;
      const makeReadable = () =>
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (idx < replies.length) {
              controller.enqueue(new TextEncoder().encode(`${replies[idx++]}\r\n`));
            } else {
              controller.close();
            }
          },
        });
      const received: string[] = [];
      const makeWritable = () =>
        new WritableStream<Uint8Array>({
          write(chunk) {
            received.push(new TextDecoder().decode(chunk));
          },
        });

      const startTlsSpy = vi.fn(() => ({ readable: makeReadable(), writable: makeWritable(), startTls: undefined }));
      const socket = { readable: makeReadable(), writable: makeWritable(), startTls: startTlsSpy };

      let connectArgs: { host?: string; port?: number; options?: { tls?: boolean } } = {};
      const socketFactory = {
        connect: (host: string, port: number, options?: { tls?: boolean }) => {
          connectArgs = { host, port, options };
          return socket;
        },
      };

      const gmail = EmailProviderFactory.resolve('gmail', { socketFactory });
      const result = await gmail.sendEmail({
        from: 'sender@gmail.com',
        to: 'rcpt@example.com',
        subject: 'Hi',
        body: 'Body',
        mimeMessage: 'From: sender@gmail.com\r\nTo: rcpt@example.com\r\nSubject: Hi\r\n\r\nBody\r\n',
        credentials: { email: 'sender@gmail.com', secret: 'app-pass' },
      });

      expect(result.success).toBe(true);
      expect(connectArgs.port).toBe(587);
      expect(connectArgs.options?.tls).toBe(false);
      expect(startTlsSpy).toHaveBeenCalled();
      expect(received.join('')).toContain('STARTTLS');
    });

    it('rejects disabled providers via the registry', () => {
      expect(() => EmailProviderFactory.resolve('microsoft')).toThrow(/not enabled/);
    });
  });
});
