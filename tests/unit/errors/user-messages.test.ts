import { describe, it, expect } from 'vitest';
import { USER_MESSAGES, getUserMessage } from '@/lib/errors/user-messages';

describe('lib/errors/user-messages', () => {
  it('maps every base error code', () => {
    expect(USER_MESSAGES.VALIDATION_ERROR).toBe('Please correct the highlighted fields.');
    expect(USER_MESSAGES.AUTHENTICATION_ERROR).toBe('Please log in to continue.');
    expect(USER_MESSAGES.AUTHORIZATION_ERROR).toBe('You do not have permission to access this resource.');
    expect(USER_MESSAGES.NOT_FOUND).toBe('The requested resource was not found.');
    expect(USER_MESSAGES.CONFLICT).toBe('This action conflicts with existing data.');
    expect(USER_MESSAGES.RATE_LIMITED).toBe("You're doing that too frequently. Please wait a moment and try again.");
    expect(USER_MESSAGES.BUSINESS_ERROR).toBe('This action cannot be completed due to a business rule.');
    expect(USER_MESSAGES.PROVIDER_ERROR).toBe("We couldn't connect to your email provider. Please check your credentials.");
    expect(USER_MESSAGES.TEMPORARY_ERROR).toBe('A temporary error occurred. Please try again.');
    expect(USER_MESSAGES.INTERNAL_ERROR).toBe("We couldn't complete your request. Please try again.");
  });

  it('maps specific messages', () => {
    expect(USER_MESSAGES.EMAIL_REQUIRED).toBe('Please enter a valid email address.');
    expect(USER_MESSAGES.EMAIL_ACCOUNT_DUPLICATE).toBe('This email account is already connected.');
    expect(USER_MESSAGES.DAILY_LIMIT_REACHED).toContain('daily email limit');
    expect(USER_MESSAGES.CAMPAIGN_NOT_FOUND).toBe('Campaign not found.');
    expect(USER_MESSAGES.ATTACHMENT_NOT_FOUND).toBe('Attachment not found.');
    expect(USER_MESSAGES.CONTACT_NOT_FOUND).toBe('Contact not found.');
    expect(USER_MESSAGES.TEMPLATE_NOT_FOUND).toBe('Template not found.');
    expect(USER_MESSAGES.EMAIL_ACCOUNT_NOT_FOUND).toBe('Email account not found.');
    expect(USER_MESSAGES.CAMPAIGN_PAUSED).toBe('Campaign paused.');
    expect(USER_MESSAGES.CAMPAIGN_RESUMED).toBe('Campaign resumed.');
    expect(USER_MESSAGES.CAMPAIGN_CANCELLED).toBe('Campaign cancelled.');
    expect(USER_MESSAGES.TEST_EMAIL_SENT).toBe('Email test sent successfully.');
    expect(USER_MESSAGES.ATTACHMENT_UPLOADED).toBe('Attachment uploaded successfully.');
    expect(USER_MESSAGES.CONTACT_IMPORTED).toBe('Contacts imported successfully.');
  });

  it('getUserMessage returns the specific message for a known code', () => {
    expect(getUserMessage('VALIDATION_ERROR')).toBe(USER_MESSAGES.VALIDATION_ERROR);
    expect(getUserMessage('ATTACHMENT_NOT_FOUND')).toBe(USER_MESSAGES.ATTACHMENT_NOT_FOUND);
  });

  it('getUserMessage falls back to INTERNAL_ERROR for unknown codes', () => {
    expect(getUserMessage('TOTALLY_UNKNOWN')).toBe(USER_MESSAGES.INTERNAL_ERROR);
    expect(getUserMessage('')).toBe(USER_MESSAGES.INTERNAL_ERROR);
  });
});
