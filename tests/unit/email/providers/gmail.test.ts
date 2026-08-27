import { describe, it, expect } from 'vitest';
import { GmailProvider } from '@/lib/email/providers/gmail';

describe('lib/email/providers/gmail', () => {
  const provider = new GmailProvider();

  describe('getCapabilities', () => {
    it('should return correct capabilities', () => {
      const caps = provider.getCapabilities();
      expect(caps.supportsOAuth2).toBe(false);
      expect(caps.supportsAppPassword).toBe(true);
      expect(caps.supportsPassword).toBe(false);
      expect(caps.supportsAttachments).toBe(true);
    });
  });

  describe('testConnection', () => {
    it('should return failure when credentials are missing', async () => {
      const result = await provider.testConnection({ email: '', secret: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('sendEmail', () => {
    it('should return failure when credentials are missing', async () => {
      const result = await provider.sendEmail({
        from: 'test@example.com',
        to: 'recipient@example.com',
        subject: 'Test',
        body: 'Hello',
        mimeMessage: 'test',
        credentials: { email: '', secret: '' },
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing credentials.');
    });
  });
});
