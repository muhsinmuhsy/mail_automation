import { dotStuff } from '../../mime';

export interface SmtpSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  /**
   * Upgrades the connection to TLS after a successful SMTP `STARTTLS` reply.
   * Returns a socket whose streams are already TLS-encrypted. Undefined when
   * the underlying runtime does not support STARTTLS upgrades.
   */
  startTls?: () => Promise<SmtpSocket> | SmtpSocket;
}

export interface SocketFactory {
  connect(
    host: string,
    port: number,
    options?: { tls?: boolean; timeoutMs?: number }
  ): Promise<SmtpSocket> | SmtpSocket;
}

type CfSocket = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  startTls?: (options?: unknown) => CfSocket;
  close?: () => void;
};

function wrapSocket(cfSocket: CfSocket): SmtpSocket {
  return {
    readable: cfSocket.readable,
    writable: cfSocket.writable,
    startTls: typeof cfSocket.startTls === 'function' ? () => wrapSocket(cfSocket.startTls!()) : undefined,
  };
}

/** Default socket factory backed by the Cloudflare Workers `connect` API. */
export const defaultSocketFactory: SocketFactory = {
  connect(host, port, options) {
    const connectFn = (globalThis as unknown as {
      connect?: (host: string, port: number, opts?: { tls?: boolean }) => CfSocket;
    }).connect;
    if (typeof connectFn !== 'function') {
      throw new Error('No TCP connect() available in this runtime.');
    }
    const cfSocket = connectFn(host, port, options?.tls ? { tls: true } : undefined);
    return wrapSocket(cfSocket);
  },
};

export type SmtpReply = {
  code: number;
  message: string;
  lines: string[];
  success: boolean;
};

export class SmtpError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = 'SmtpError';
  }
}

const REPLY_LINE = /^(\d{3})([- ])(.*)$/;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SmtpError(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Minimal, dependency-free SMTP client. Reads replies (handling multi-line
 * responses), writes CRLF-terminated commands, and performs the DATA phase
 * with proper dot-stuffing. A {@link SocketFactory} is injectable so the
 * transport can be exercised in tests without a real socket.
 */
export class SmtpClient {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private buffer = '';
  private closed = false;
  private socket: SmtpSocket;

  constructor(socket: SmtpSocket, private timeoutMs = 15000) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }

  /** Re-binds the reader/writer to the (possibly upgraded) socket streams. */
  private resetStreams(): void {
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();
  }

  private async readLine(): Promise<string | null> {
    while (!this.buffer.includes('\r\n')) {
      const { done, value } = await withTimeout(this.reader.read(), this.timeoutMs, 'read');
      if (done) {
        return this.buffer.length > 0 ? this.buffer : null;
      }
      this.buffer += this.decoder.decode(value, { stream: true });
    }
    const idx = this.buffer.indexOf('\r\n');
    const line = this.buffer.slice(0, idx);
    this.buffer = this.buffer.slice(idx + 2);
    return line;
  }

  /** Reads a full SMTP reply, following multi-line (code + '-') continuations. */
  async readReply(): Promise<SmtpReply> {
    const lines: string[] = [];
    while (true) {
      const line = await withTimeout(this.readLine(), this.timeoutMs, 'readReply');
      if (line === null) {
        throw new SmtpError('Connection closed before reply completed.');
      }
      lines.push(line);
      const match = REPLY_LINE.exec(line);
      if (!match) {
        continue;
      }
      const code = Number.parseInt(match[1], 10);
      const cont = match[2] === '-';
      if (cont) {
        continue;
      }
      return {
        code,
        message: match[3],
        lines,
        success: code >= 200 && code < 300,
      };
    }
  }

  async sendCommand(command: string): Promise<SmtpReply> {
    await withTimeout(
      this.writer.write(this.encoder.encode(`${command}\r\n`)),
      this.timeoutMs,
      'write'
    );
    return this.readReply();
  }

  /**
   * Performs the DATA phase. The provided raw message (CRLF line endings) is
   * dot-stuffed and terminated with the `.` end-of-data marker.
   */
  async sendData(rawMessage: string): Promise<SmtpReply> {
    const reply = await this.sendCommand('DATA');
    if (!reply.success && reply.code !== 354) {
      throw new SmtpError(`DATA not accepted: ${reply.code} ${reply.message}`, reply.code);
    }
    const stuffed = dotStuff(rawMessage).replace(/\r\n/g, '\r\n');
    const data = `${stuffed}\r\n.\r\n`;
    await withTimeout(
      this.writer.write(this.encoder.encode(data)),
      this.timeoutMs,
      'writeData'
    );
    return this.readReply();
  }

  async greet(domain: string): Promise<SmtpReply> {
    const reply = await this.readReply();
    if (!reply.success && reply.code !== 220) {
      throw new SmtpError(`Bad greeting: ${reply.code} ${reply.message}`, reply.code);
    }
    return this.sendCommand(`EHLO ${domain}`);
  }

  async startTls(domain: string): Promise<SmtpReply> {
    const reply = await this.sendCommand('STARTTLS');
    if (!reply.success) {
      throw new SmtpError(`STARTTLS rejected: ${reply.code} ${reply.message}`, reply.code);
    }
    if (typeof this.socket.startTls !== 'function') {
      throw new SmtpError('STARTTLS upgrade is not supported by the underlying socket.');
    }
    // Cloudflare requires both stream locks released before startTls().
    // Do not close the streams: that would close the underlying TCP socket.
    this.writer.releaseLock();
    this.reader.releaseLock();
    this.buffer = '';
    this.decoder = new TextDecoder();
    this.socket = await this.socket.startTls();
    this.resetStreams();
    return this.sendCommand(`EHLO ${domain}`);
  }

  async quit(): Promise<void> {
    try {
      await this.sendCommand('QUIT');
    } catch {
      // best effort
    } finally {
      await this.close();
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.writer.close();
    } catch {
      // ignore
    }
    try {
      this.reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
