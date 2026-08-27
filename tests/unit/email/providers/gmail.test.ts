import { describe, it, expect } from 'vitest';
import { GmailProvider } from '@/lib/email/providers/gmail';

describe('lib/email/providers/gmail', () => {
  let provider: GmailProvider;

  beforeEach(() => {
    provider = new GmailProvider();
  });

  describe('getCapabilities', () => {
    it('should return correct capabilities', () => {
      const caps = provider.getCapabilities();
      expect(caps.supportsAppPassword).toBe(true);
      expect(caps.supportsAttachments).toBe(true);
      expect(caps.supportsOAuth2).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('should return success when AUTH succeeds', async () => {
      const originalConnect = (globalThis as unknown as Record<string, unknown>).connect;
      (globalThis as unknown as Record<string, unknown>).connect = createMockConnect([
        '220 smtp.gmail.com ESMTP',
        '250-smtp.gmail.com',
        '334 VXNlcm5hbWU6',
        '334 UGFzc3dvcmQ6',
        '235 2.7.0 Accepted',
        '221 2.0.0 closing',
      ]);

      const result = await provider.testConnection({ email: 'test@gmail.com', secret: 'secret' });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connection successful.');

      (globalThis as unknown as Record<string, unknown>).connect = originalConnect;
    });
  });

  describe('sendEmail', () => {
    it('should return success when email is sent', async () => {
      const originalConnect = (globalThis as unknown as Record<string, unknown>).connect;
      (globalThis as unknown as Record<string, unknown>).connect = createMockConnect([
        '220 smtp.gmail.com ESMTP',
        '250-smtp.gmail.com',
        '334 VXNlcm5hbWU6',
        '334 UGFzc3dvcmQ6',
        '235 2.7.0 Accepted',
        '250 2.1.0 OK',
        '250 2.1.0 OK',
        '354  End data with <CR><LF>.<CR><LF>',
        '250 2.0.0 OK',
        '221 2.0.0 closing',
      ]);

      const result = await provider.sendEmail({
        from: 'test@gmail.com',
        to: 'recipient@example.com',
        subject: 'Hello',
        body: 'Body',
        mimeMessage: 'MIME message here',
        credentials: { email: 'test@gmail.com', secret: 'secret' },
      });

      expect(result.success).toBe(true);
      expect(result.smtpResponse).toBe('2.0.0 OK');

      (globalThis as unknown as Record<string, unknown>).connect = originalConnect;
    });
  });
});

function createMockConnect(lines: string[]) {
  return () => {
    let index = 0;
    const readable = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < lines.length) {
          const line = lines[index++] + '\r\n';
          controller.enqueue(new TextEncoder().encode(line));
        } else {
          controller.close();
        }
      },
    });
    const chunks: Uint8Array[] = [];
    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk);
      },
    });

    return { readable, writable };
  };
}
