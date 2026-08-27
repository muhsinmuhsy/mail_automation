export interface SmtpResponse {
  code: number;
  message: string;
}

export class SmtpClient {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private buffer = '';

  constructor(readable: ReadableStream<Uint8Array>, writable: WritableStream<Uint8Array>) {
    this.reader = readable.getReader();
    this.writer = writable.getWriter();
  }

  async readResponse(): Promise<SmtpResponse> {
    while (true) {
      const { done, value } = await this.reader.read();
      if (done) {
        throw new Error('SMTP connection closed unexpectedly.');
      }
      this.buffer += new TextDecoder().decode(value);
      const lines = this.buffer.split('\r\n');
      this.buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line) continue;
        const match = line.match(/^(\d{3})(?:[- ])(.+)$/);
        if (!match) continue;
        const code = Number(match[1]);
        const isContinuation = match[2].startsWith('-');
        if (isContinuation) continue;
        return { code, message: match[2].trim() };
      }
    }
  }

  async writeLine(line: string): Promise<void> {
    await this.writer.write(new TextEncoder().encode(`${line}\r\n`));
  }

  async close(): Promise<void> {
    try {
      await this.writer.close();
    } catch {
      // ignore
    }
    this.reader.releaseLock();
  }
}

export async function connectSmtp(host: string, port: number, tls: boolean = false): Promise<SmtpClient> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connectFn = (globalThis as any).connect as ((host: string, port: number, options?: { tls?: boolean }) => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }) | undefined;
  if (!connectFn) {
    throw new Error('connect is not available in this environment');
  }
  const socket = connectFn(host, port, tls ? { tls: true } : undefined);
  if (!socket) {
    throw new Error(`Failed to connect to ${host}:${port}`);
  }
  const client = new SmtpClient(socket.readable, socket.writable);
  const greeting = await client.readResponse();
  if (greeting.code !== 220) {
    throw new Error(`SMTP greeting failed: ${greeting.code} ${greeting.message}`);
  }
  return client;
}

export function encodeBase64(input: string): string {
  return btoa(input);
}

export function decodeBase64(input: string): string {
  return atob(input);
}
