import {
  SmtpClient,
  defaultSocketFactory,
  type SocketFactory,
  SmtpError,
} from '../smtp/transport';
import {
  EmailProvider,
  TestConnectionResult,
  SendEmailInput,
  SendEmailResult,
  ProviderCapabilities,
} from '../types';

export type GmailProviderOptions = {
  socketFactory?: SocketFactory;
  /** Use implicit TLS (465) or STARTTLS (587). Default: implicit TLS. */
  useStartTls?: boolean;
  host?: string;
  port?: number;
  timeoutMs?: number;
};

function base64(input: string): string {
  return typeof btoa === 'function'
    ? btoa(input)
    : Buffer.from(input, 'utf-8').toString('base64');
}

/**
 * Gmail SMTP provider. App-password authentication over TLS. The socket
 * factory is injectable so the transport can be tested without a live
 * connection. The DATA payload is built by the caller (already MIME-encoded).
 */
export class GmailProvider implements EmailProvider {
  private readonly host: string;
  private readonly port: number;
  private readonly useStartTls: boolean;
  private readonly timeoutMs: number;
  private readonly socketFactory: SocketFactory;

  constructor(options: GmailProviderOptions = {}) {
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
    this.useStartTls = options.useStartTls ?? false;
    this.host = options.host ?? 'smtp.gmail.com';
    this.port = options.port ?? (this.useStartTls ? 587 : 465);
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsOAuth2: false,
      supportsAppPassword: true,
      supportsPassword: false,
      supportsAttachments: true,
    };
  }

  private async connect(): Promise<SmtpClient> {
    const socket = await this.socketFactory.connect(this.host, this.port, {
      tls: !this.useStartTls,
      timeoutMs: this.timeoutMs,
    });
    return new SmtpClient(socket, this.timeoutMs);
  }

  private async authLogin(
    client: SmtpClient,
    email: string,
    secret: string
  ): Promise<{ success: boolean; error?: string }> {
    const authReply = await client.sendCommand('AUTH LOGIN');
    if (authReply.code !== 334) {
      return { success: false, error: `AUTH rejected: ${authReply.message}` };
    }
    const userReply = await client.sendCommand(base64(email));
    if (userReply.code !== 334) {
      return { success: false, error: `Username rejected: ${userReply.message}` };
    }
    const passReply = await client.sendCommand(base64(secret));
    if (passReply.code !== 235) {
      return { success: false, error: `Password rejected: ${passReply.message}` };
    }
    return { success: true };
  }

  async testConnection(config: { email: string; secret: string }): Promise<TestConnectionResult> {
    let client: SmtpClient | undefined;
    try {
      client = await this.connect();
      const ehlo = await client.greet(config.email.split('@')[1] || 'localhost');
      if (!ehlo.success) {
        return { success: false, message: `EHLO failed: ${ehlo.message}`, provider: 'gmail' };
      }
      const auth = await this.authLogin(client, config.email, config.secret);
      if (!auth.success) {
        await client.close().catch(() => {});
        return { success: false, message: auth.error || 'Authentication failed.', provider: 'gmail' };
      }
      await client.quit();
      return { success: true, message: 'Connection successful.', provider: 'gmail' };
    } catch (err) {
      await client?.close().catch(() => {});
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Connection failed.',
        provider: 'gmail',
      };
    }
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    if (!input.credentials?.secret) {
      return { success: false, error: 'Missing credentials.', errorType: 'permanent' };
    }

    let client: SmtpClient | undefined;
    try {
      client = await this.connect();
      const domain = input.from.split('@')[1] || 'localhost';
      const ehlo = await client.greet(domain);
      if (!ehlo.success) {
        throw new SmtpError(`EHLO failed: ${ehlo.message}`, ehlo.code);
      }

      if (this.useStartTls) {
        await client.startTls(domain);
      }

      const auth = await this.authLogin(client, input.credentials.email, input.credentials.secret);
      if (!auth.success) {
        await client.close().catch(() => {});
        return { success: false, error: auth.error || 'Authentication failed.', errorType: 'permanent' };
      }

      const mailFrom = await client.sendCommand(`MAIL FROM:<${input.from}>`);
      if (!mailFrom.success) {
        throw new SmtpError(`MAIL FROM failed: ${mailFrom.message}`, mailFrom.code);
      }

      const rcpt = await client.sendCommand(`RCPT TO:<${input.to}>`);
      if (!rcpt.success) {
        const errorType = rcpt.code >= 550 && rcpt.code < 600 ? 'permanent' : 'temporary';
        await client.close().catch(() => {});
        return { success: false, error: rcpt.message, errorType };
      }

      const data = await client.sendData(input.mimeMessage);
      if (!data.success) {
        const errorType = data.code >= 550 && data.code < 600 ? 'permanent' : 'temporary';
        await client.close().catch(() => {});
        return { success: false, error: data.message, errorType };
      }

      await client.quit();
      return {
        success: true,
        messageId: `<${Date.now()}@${domain}>`,
        smtpResponse: data.message,
      };
    } catch (err) {
      await client?.close().catch(() => {});
      if (err instanceof SmtpError) {
        const errorType = err.code && err.code >= 550 && err.code < 600 ? 'permanent' : 'temporary';
        return { success: false, error: err.message, errorType };
      }
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error', errorType: 'temporary' };
    }
  }
}
