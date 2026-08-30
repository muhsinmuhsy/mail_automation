import { describe, it, expect } from 'vitest';
import { GmailProvider } from '@/lib/email/providers/gmail';
import { buildMimeMessage } from '@/lib/email/mime';
import type { SocketFactory } from '@/lib/email/providers/smtp/transport';

function createScriptedSocket(replies: string): {
  socket: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
  written: string[];
} {
  const written: string[] = [];
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(replies));
      controller.close();
    },
  });
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      written.push(new TextDecoder().decode(chunk));
    },
  });
  return { socket: { readable, writable }, written };
}

function socketFactoryFrom(replies: string): SocketFactory {
  const { socket, written } = createScriptedSocket(replies);
  return {
    connect: () => socket,
    written,
  } as unknown as SocketFactory & { written: string[] };
}

const SUCCESS_REPLIES =
  '220 smtp ready\r\n' +
  '250-smtp.ok\r\n250 SIZE 123\r\n' +
  '334 VXNlcm5hbWU6\r\n' +
  '334 UGFzc3dvcmQ6\r\n' +
  '235 2.7.0 Authenticated\r\n' +
  '250 2.1.0 OK\r\n' +
  '250 2.1.5 OK\r\n' +
  '354 Go ahead\r\n' +
  '250 2.0.0 OK\r\n' +
  '221 Bye\r\n';

describe('lib/email/providers/gmail (transport)', () => {
  it('performs a full SMTP transaction over an injected socket', async () => {
    const factory = socketFactoryFrom(SUCCESS_REPLIES);
    const provider = new GmailProvider({ socketFactory: factory });

    const mimeMessage = buildMimeMessage({
      from: 'sender@gmail.com',
      to: 'rcpt@example.com',
      subject: 'Hi',
      body: 'Hello world',
    });

    const result = await provider.sendEmail({
      from: 'sender@gmail.com',
      to: 'rcpt@example.com',
      subject: 'Hi',
      body: 'Hello world',
      mimeMessage,
      credentials: { email: 'sender@gmail.com', secret: 'app-pass' },
    });

    expect(result.success).toBe(true);
    const written = (factory as unknown as { written: string[] }).written.join('');
    expect(written).toContain('EHLO');
    expect(written).toContain('AUTH LOGIN');
    expect(written).toContain('MAIL FROM:<sender@gmail.com>');
    expect(written).toContain('RCPT TO:<rcpt@example.com>');
    expect(written).toContain('DATA');
    expect(written).toContain('QUIT');
    expect(written).toContain('.\r\n');
  });

  it('dot-stuffs message lines that begin with a dot during DATA', async () => {
    const factory = socketFactoryFrom(SUCCESS_REPLIES);
    const provider = new GmailProvider({ socketFactory: factory });

    // A pre-built MIME message whose body contains a line starting with a dot.
    const mimeMessage =
      'From: sender@gmail.com\r\nTo: rcpt@example.com\r\nSubject: S\r\n\r\n' +
      'normal line\r\n.attack line\r\nend';

    const result = await provider.sendEmail({
      from: 'sender@gmail.com',
      to: 'rcpt@example.com',
      subject: 'S',
      body: 'normal line\n.attack line\nend',
      mimeMessage,
      credentials: { email: 'sender@gmail.com', secret: 'app-pass' },
    });

    expect(result.success).toBe(true);
    const written = (factory as unknown as { written: string[] }).written.join('');
    // The DATA payload must contain the stuffed "..attack" line so it is not
    // interpreted as the end-of-data marker.
    expect(written).toContain('..attack line');
  });

  it('returns a permanent failure when authentication is rejected', async () => {
    const rejected =
      '220 smtp ready\r\n' +
      '250-smtp.ok\r\n250 SIZE\r\n' +
      '334 VXNlcm5hbWU6\r\n' +
      '334 UGFzc3dvcmQ6\r\n' +
      '535 5.7.8 Authentication failed\r\n';

    const factory = socketFactoryFrom(rejected);
    const provider = new GmailProvider({ socketFactory: factory });

    const result = await provider.sendEmail({
      from: 'sender@gmail.com',
      to: 'rcpt@example.com',
      subject: 'S',
      body: 'b',
      mimeMessage: buildMimeMessage({ from: 'sender@gmail.com', to: 'rcpt@example.com', subject: 'S', body: 'b' }),
      credentials: { email: 'sender@gmail.com', secret: 'wrong' },
    });

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('permanent');
  });
});
