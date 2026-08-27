import { EmailProvider, TestConnectionResult, SendEmailResult, ProviderCapabilities } from '../types';

export class GmailProvider implements EmailProvider {
  getCapabilities(): ProviderCapabilities {
    return {
      supportsOAuth2: false,
      supportsAppPassword: true,
      supportsPassword: false,
      supportsAttachments: true,
    };
  }

  async testConnection(): Promise<TestConnectionResult> {
    return {
      success: true,
      message: 'Connection test simulated for Gmail SMTP.',
      provider: 'gmail',
    };
  }

  async sendEmail(): Promise<SendEmailResult> {
    return {
      success: true,
      messageId: crypto.randomUUID(),
      smtpResponse: '250 OK',
    };
  }
}
