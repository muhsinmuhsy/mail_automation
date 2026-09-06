import { describe, it, expect, afterEach } from 'vitest';
import {
  SmtpClient,
  SmtpError,
  defaultSocketFactory,
  type SmtpSocket,
} from '@/lib/email/providers/smtp/transport';

function makeReadable(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function makeStreamingReadable(chunks: string[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(new TextEncoder().encode(chunks[i++]));
      } else {
        controller.close();
      }
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

interface ClientH {
  client: SmtpClient;
  written: string[];
}

function makeClient(replies: string, timeoutMs = 15000, overrides: Partial<SmtpSocket> = {}): ClientH {
  const written: string[] = [];
  const socket: SmtpSocket = { readable: makeReadable(replies), writable: makeWritable(written), ...overrides };
  return { client: new SmtpClient(socket, timeoutMs), written };
}

describe('lib/email/providers/smtp/transport', () => {
  describe('SmtpError', () => {
    it('captures the SMTP reply code', () => {
      const err = new SmtpError('nope', 550);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('SmtpError');
      expect(err.code).toBe(550);
      expect(err.message).toBe('nope');
    });

    it('works without a code', () => {
      const err = new SmtpError('timed out');
      expect(err.code).toBeUndefined();
    });
  });

  describe('readReply', () => {
    it('parses a single successful reply', async () => {
      const { client } = makeClient('250 OK\r\n');
      const r = await client.readReply();
      expect(r.code).toBe(250);
      expect(r.message).toBe('OK');
      expect(r.success).toBe(true);
      expect(r.lines).toEqual(['250 OK']);
    });

    it('follows multi-line continuations', async () => {
      const { client } = makeClient('250-a\r\n250 b\r\n');
      const r = await client.readReply();
      expect(r.code).toBe(250);
      expect(r.message).toBe('b');
      expect(r.lines).toEqual(['250-a', '250 b']);
    });

    it('treats 4xx as a non-success reply', async () => {
      const { client } = makeClient('450 temporary failure\r\n');
      const r = await client.readReply();
      expect(r.success).toBe(false);
    });

    it('skips non-matching lines and uses the terminating line', async () => {
      const { client } = makeClient('* BYE\r\n250 done\r\n');
      const r = await client.readReply();
      expect(r.code).toBe(250);
      expect(r.message).toBe('done');
    });

    it('throws when the connection closes before a reply completes', async () => {
      const { client } = makeClient('');
      await expect(client.readReply()).rejects.toThrow(/Connection closed before reply completed/);
    });
  });

  describe('readLine', () => {
    it('reassembles a line split across chunks', async () => {
      const written: string[] = [];
      const socket: SmtpSocket = {
        readable: makeStreamingReadable(['250 ', 'OK\r\n']),
        writable: makeWritable(written),
      };
      const client = new SmtpClient(socket, 15000);
      const line = await (client as unknown as { readLine(): Promise<string | null> }).readLine();
      expect(line).toBe('250 OK');
    });

    it('returns leftover buffer when the stream ends mid-line', async () => {
      const written: string[] = [];
      const socket: SmtpSocket = {
        readable: makeStreamingReadable(['partial']),
        writable: makeWritable(written),
      };
      const client = new SmtpClient(socket, 15000);
      const line = await (client as unknown as { readLine(): Promise<string | null> }).readLine();
      expect(line).toBe('partial');
    });
  });

  describe('sendCommand', () => {
    it('writes a CRLF-terminated command and returns the reply', async () => {
      const { client, written } = makeClient('250 ehlo done\r\n');
      const r = await client.sendCommand('EHLO example.com');
      expect(r.code).toBe(250);
      expect(written.join('')).toContain('EHLO example.com\r\n');
    });
  });

  describe('sendData', () => {
    it('dot-stuffs the payload and terminates with the end-of-data marker', async () => {
      const { client, written } = makeClient('354 go ahead\r\n250 queued\r\n');
      const r = await client.sendData('Subject: x\r\n\r\nbody\r\n.attack\r\nend');
      expect(r.code).toBe(250);
      const out = written.join('');
      expect(out).toContain('..attack');
      expect(out).toContain('\r\n.\r\n');
    });

    it('throws when DATA is not accepted', async () => {
      const { client } = makeClient('500 cannot accept data\r\n');
      await expect(client.sendData('x')).rejects.toThrow(/DATA not accepted: 500/);
    });
  });

  describe('greet', () => {
    it('reads the greeting then issues EHLO', async () => {
      const { client, written } = makeClient('220 smtp ready\r\n250 EHLO ok\r\n');
      const r = await client.greet('example.com');
      expect(r.code).toBe(250);
      expect(written.join('')).toContain('EHLO example.com');
    });

    it('throws on a bad greeting', async () => {
      const { client } = makeClient('550 bad greeting\r\n');
      await expect(client.greet('example.com')).rejects.toThrow(/Bad greeting/);
    });
  });

  describe('startTls', () => {
    it('negotiates STARTTLS then re-EHLOs over the upgraded socket', async () => {
      const written: string[] = [];
      const after = makeReadable('250 EHLO after tls\r\n');
      const before: SmtpSocket = {
        readable: makeReadable('220 ready\r\n250 EHLO pre\r\n220 2.0.0 Ready to start TLS\r\n'),
        writable: makeWritable(written),
        startTls: () => {
          expect(before.readable.locked).toBe(false);
          expect(before.writable.locked).toBe(false);
          return { readable: after, writable: makeWritable(written) };
        },
      };
      const client = new SmtpClient(before, 15000);
      await client.greet('example.com');
      const r = await client.startTls('example.com');
      expect(r.code).toBe(250);
      expect(written.join('')).toContain('STARTTLS');
    });

    it('throws when STARTTLS is rejected', async () => {
      const { client } = makeClient('550 5.7.0 STARTTLS rejected\r\n');
      await expect(client.startTls('example.com')).rejects.toThrow(/STARTTLS rejected/);
    });

    it('throws when the socket does not support STARTTLS upgrades', async () => {
      const { client } = makeClient('220 ready\r\n250 EHLO\r\n220 starttls ok\r\n');
      await expect(client.startTls('example.com')).rejects.toThrow(/not supported/);
    });
  });

  describe('quit', () => {
    it('issues QUIT and closes without throwing on read errors', async () => {
      const { client, written } = makeClient('');
      await expect(client.quit()).resolves.toBeUndefined();
      expect(written.join('')).toContain('QUIT');
    });
  });

  describe('close', () => {
    it('is idempotent', async () => {
      const { client } = makeClient('220 ok\r\n');
      await client.close();
      await expect(client.close()).resolves.toBeUndefined();
    });

    it('swallows writer.close() failures', async () => {
      const written: string[] = [];
      const socket: SmtpSocket = {
        readable: makeReadable('220 ok\r\n'),
        writable: new WritableStream({ write() {}, close() { throw new Error('closed'); } }),
      };
      const client = new SmtpClient(socket, 15000);
      await expect(client.close()).resolves.toBeUndefined();
      expect(written).toBeDefined();
    });
  });

  describe('timeouts', () => {
    it('rejects with a timeout error when the socket never replies', async () => {
      const hanging = new ReadableStream<Uint8Array>({ pull() {} });
      const socket: SmtpSocket = { readable: hanging, writable: makeWritable([]) };
      const client = new SmtpClient(socket, 20);
      await expect(client.readReply()).rejects.toThrow(/timed out/);
    });
  });

  describe('defaultSocketFactory', () => {
    afterEach(() => {
      delete (globalThis as { connect?: unknown }).connect;
    });

    it('throws when no runtime connect() is available', () => {
      delete (globalThis as { connect?: unknown }).connect;
      expect(() => defaultSocketFactory.connect('host', 25, { tls: false })).toThrow(/No TCP connect/);
    });

    it('wraps a Cloudflare socket (with startTls) into an SmtpSocket', () => {
      const r = makeReadable('');
      const w = makeWritable([]);
      (globalThis as { connect?: unknown }).connect = () => ({
        readable: r,
        writable: w,
        startTls: () => ({ readable: r, writable: w }),
      });
      const s = defaultSocketFactory.connect('host', 25, { tls: true }) as unknown as {
        startTls?: unknown;
      };
      expect(typeof s.startTls).toBe('function');
    });

    it('omits startTls when the underlying socket lacks it', () => {
      const r = makeReadable('');
      const w = makeWritable([]);
      (globalThis as { connect?: unknown }).connect = () => ({ readable: r, writable: w });
      const s = defaultSocketFactory.connect('host', 25, { tls: true }) as unknown as {
        startTls?: unknown;
      };
      expect(s.startTls).toBeUndefined();
    });
  });
});
