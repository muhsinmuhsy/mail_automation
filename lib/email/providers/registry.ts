import { EmailProvider } from './types';

export const ENABLED_PROVIDERS = new Set(['gmail']);

export const PROVIDER_CAPABILITIES: Record<string, { capabilities: ReturnType<EmailProvider['getCapabilities']>; smtpHost: string; smtpPort: number }> = {
  gmail: {
    capabilities: {
      supportsOAuth2: true,
      supportsAppPassword: true,
      supportsPassword: false,
      supportsAttachments: true,
    },
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
  },
};

// Public metadata is safe to import into the client. Availability is enforced server-side too.
export const PROVIDERS = [
  { id: 'gmail', name: 'Gmail', marker: 'G', enabled: true, connectionMethod: 'oauth2' },
  { id: 'microsoft', name: 'Microsoft', marker: 'M', enabled: false, connectionMethod: 'oauth2' },
  { id: 'yahoo', name: 'Yahoo', marker: 'Y', enabled: false, connectionMethod: 'app_password' },
  { id: 'custom_smtp', name: 'Custom SMTP', marker: 'SMTP', enabled: false, connectionMethod: 'password' },
] as const;
