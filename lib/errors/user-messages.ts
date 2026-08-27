export const USER_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Please correct the highlighted fields.',
  AUTHENTICATION_ERROR: 'Please log in to continue.',
  AUTHORIZATION_ERROR: 'You do not have permission to access this resource.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'This action conflicts with existing data.',
  RATE_LIMITED: "You're doing that too frequently. Please wait a moment and try again.",
  BUSINESS_ERROR: 'This action cannot be completed due to a business rule.',
  PROVIDER_ERROR: "We couldn't connect to your email provider. Please check your credentials.",
  TEMPORARY_ERROR: 'A temporary error occurred. Please try again.',
  INTERNAL_ERROR: "We couldn't complete your request. Please try again.",

  // Specific messages
  EMAIL_REQUIRED: 'Please enter a valid email address.',
  PASSWORD_REQUIRED: 'Please enter your password.',
  NAME_REQUIRED: 'Please enter your name.',
  EMAIL_ACCOUNT_DUPLICATE: 'This email account is already connected.',
  SMTP_AUTH_FAILED: "We couldn't authenticate with your email provider. Please check your credentials.",
  DAILY_LIMIT_REACHED: "You've reached your daily email limit. Remaining emails will continue on the next available day.",
  CAMPAIGN_NOT_FOUND: 'Campaign not found.',
  RESUME_NOT_FOUND: 'Resume not found.',
  CONTACT_NOT_FOUND: 'Contact not found.',
  TEMPLATE_NOT_FOUND: 'Template not found.',
  EMAIL_ACCOUNT_NOT_FOUND: 'Email account not found.',
  CAMPAIGN_PAUSED: 'Campaign paused.',
  CAMPAIGN_RESUMED: 'Campaign resumed.',
  CAMPAIGN_CANCELLED: 'Campaign cancelled.',
  TEST_EMAIL_SENT: 'Email test sent successfully.',
  RESUME_UPLOADED: 'Resume uploaded successfully.',
  CONTACT_IMPORTED: 'Contacts imported successfully.',
};

export function getUserMessage(code: string): string {
  return USER_MESSAGES[code] || USER_MESSAGES.INTERNAL_ERROR;
}
