import { EmailProvider } from './types';

export const ENABLED_PROVIDERS = new Set(['gmail']);

export const PROVIDER_CAPABILITIES: Record<string, { capabilities: ReturnType<EmailProvider['getCapabilities']>; smtpHost: string; smtpPort: number }> = {
  gmail: {
    capabilities: {
      supportsOAuth2: false,
      supportsAppPassword: true,
      supportsPassword: false,
      supportsAttachments: true,
    },
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
  },
};
