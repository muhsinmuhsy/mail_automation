import type { Attachment } from '../mime';

export interface TestConnectionResult {
  success: boolean;
  message: string;
  provider?: string;
}

export interface SendEmailInput {
  from: string;
  to: string;
  subject: string;
  body: string;
  mimeMessage: string;
  attachments?: Attachment[];
  credentials?: {
    email: string;
    secret: string;
  };
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  smtpResponse?: string;
  providerResponse?: string;
  reconnectRequired?: boolean;
  error?: string;
  errorType?: 'temporary' | 'permanent' | 'unknown';
}

export interface ProviderOptions {
  authMethod?: 'oauth2' | 'app_password' | 'password';
  fetcher?: typeof fetch;
  socketFactory?: import('./smtp/transport').SocketFactory;
  useStartTls?: boolean;
  host?: string;
  port?: number;
  timeoutMs?: number;
}

export interface ProviderCapabilities {
  supportsOAuth2: boolean;
  supportsAppPassword: boolean;
  supportsPassword: boolean;
  supportsAttachments: boolean;
}

export interface EmailProvider {
  testConnection(config: { email: string; secret: string }): Promise<TestConnectionResult>;
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
  getCapabilities(): ProviderCapabilities;
}
