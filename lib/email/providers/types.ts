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
  credentials?: {
    email: string;
    secret: string;
  };
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  smtpResponse?: string;
  error?: string;
  errorType?: 'temporary' | 'permanent';
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
