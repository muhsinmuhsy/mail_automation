import { EmailProvider, TestConnectionResult, SendEmailInput, SendEmailResult, ProviderCapabilities } from '../types';
import { connectSmtp, encodeBase64 } from './smtp';

export class GmailProvider implements EmailProvider {
  private readonly host = 'smtp.gmail.com';
  private readonly port = 587;

  getCapabilities(): ProviderCapabilities {
    return {
      supportsOAuth2: false,
      supportsAppPassword: true,
      supportsPassword: false,
      supportsAttachments: true,
    };
  }

  async testConnection(config: { email: string; secret: string }): Promise<TestConnectionResult> {
    let client;
    try {
      client = await connectSmtp(this.host, this.port, true);
      await client.writeLine(`EHLO ${config.email}`);
      const response = await client.readResponse();
      if (response.code !== 250) {
        throw new Error(`EHLO failed: ${response.message}`);
      }

      const authResult = await this.authLogin(client, config.email, config.secret);
      if (!authResult.success) {
        await client.close().catch(() => {});
        return { success: false, message: authResult.error || 'Authentication failed.', provider: 'gmail' };
      }

      await client.writeLine('QUIT');
      await client.readResponse();
      await client.close();

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

    let client;
    try {
      client = await connectSmtp(this.host, this.port, true);
      await client.writeLine(`EHLO ${input.from}`);
      const response = await client.readResponse();
      if (response.code !== 250) {
        throw new Error(`EHLO failed: ${response.message}`);
      }

      const authResult = await this.authLogin(client, input.credentials.email, input.credentials.secret);
      if (!authResult.success) {
        await client.close().catch(() => {});
        return { success: false, error: authResult.error || 'Authentication failed.', errorType: 'permanent' };
      }

      await client.writeLine(`MAIL FROM:<${input.from}>`);
      const mailFromResponse = await client.readResponse();
      if (mailFromResponse.code !== 250) {
        throw new Error(`MAIL FROM failed: ${mailFromResponse.message}`);
      }

      await client.writeLine(`RCPT TO:<${input.to}>`);
      const rcptResponse = await client.readResponse();
      if (rcptResponse.code !== 250) {
        const errorType = rcptResponse.code >= 550 && rcptResponse.code < 600 ? 'permanent' : 'temporary';
        await client.close().catch(() => {});
        return { success: false, error: rcptResponse.message, errorType };
      }

      await client.writeLine('DATA');
      const dataResponse = await client.readResponse();
      if (dataResponse.code !== 354) {
        throw new Error(`DATA failed: ${dataResponse.message}`);
      }

      await client.writeLine(input.mimeMessage);
      await client.writeLine('.');
      const dataResult = await client.readResponse();
      if (dataResult.code !== 250) {
        const errorType = dataResult.code >= 550 && dataResult.code < 600 ? 'permanent' : 'temporary';
        await client.close().catch(() => {});
        return { success: false, error: dataResult.message, errorType };
      }

      await client.writeLine('QUIT');
      await client.readResponse();
      await client.close();

      return { success: true, messageId: `${Date.now()}@gmail`, smtpResponse: dataResult.message };
    } catch (err) {
      await client?.close().catch(() => {});
      return this.errorResult(err, 'temporary');
    }
  }

  private async authLogin(
    client: { writeLine: (line: string) => Promise<void>; readResponse: () => Promise<{ code: number; message: string }>; close: () => Promise<void> },
    email: string,
    secret: string
  ): Promise<{ success: boolean; error?: string }> {
    await client.writeLine('AUTH LOGIN');
    const authResponse = await client.readResponse();
    if (authResponse.code !== 334) {
      return { success: false, error: `AUTH failed: ${authResponse.message}` };
    }

    await client.writeLine(encodeBase64(email));
    const userResponse = await client.readResponse();
    if (userResponse.code !== 334) {
      return { success: false, error: `AUTH username rejected: ${userResponse.message}` };
    }

    await client.writeLine(encodeBase64(secret));
    const passResponse = await client.readResponse();
    if (passResponse.code !== 235) {
      return { success: false, error: `AUTH password rejected: ${passResponse.message}` };
    }

    return { success: true };
  }

  private errorResult(err: unknown, defaultType: 'temporary' | 'permanent'): SendEmailResult {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      errorType: defaultType,
    };
  }
}
