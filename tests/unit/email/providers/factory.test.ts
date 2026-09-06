import { describe, it, expect } from 'vitest';
import { EmailProviderFactory } from '@/lib/email/providers/factory';
import { GmailProvider } from '@/lib/email/providers/gmail';

describe('lib/email/providers/factory', () => {
  it('isEnabled reflects the provider registry', () => {
    expect(EmailProviderFactory.isEnabled('gmail')).toBe(true);
    expect(EmailProviderFactory.isEnabled('microsoft')).toBe(false);
    expect(EmailProviderFactory.isEnabled('unknown')).toBe(false);
  });

  it('resolves a registered provider to a GmailProvider instance', () => {
    const provider = EmailProviderFactory.resolve('gmail');
    expect(provider).toBeInstanceOf(GmailProvider);
    expect(provider.getCapabilities().supportsAppPassword).toBe(true);
  });

  it('resolves gmail with caller overrides merged over registry config', () => {
    const provider = EmailProviderFactory.resolve('gmail', {
      host: 'smtp.example.com',
      port: 2525,
    });
    expect(provider).toBeInstanceOf(GmailProvider);
  });

  it('throws for a disabled provider on resolve', () => {
    expect(() => EmailProviderFactory.resolve('microsoft')).toThrow(/not enabled/);
  });

  it('throws for an unknown provider on resolve', () => {
    expect(() => EmailProviderFactory.resolve('totally-unknown')).toThrow(/not enabled/);
  });

  it('returns gmail capabilities via getCapabilities', () => {
    const caps = EmailProviderFactory.getCapabilities('gmail');
    expect(caps).toEqual({
      supportsOAuth2: true,
      supportsAppPassword: true,
      supportsPassword: false,
      supportsAttachments: true,
    });
  });

  it('throws for an unknown provider in getCapabilities', () => {
    expect(() => EmailProviderFactory.getCapabilities('unknown')).toThrow(/not enabled/);
  });
});
