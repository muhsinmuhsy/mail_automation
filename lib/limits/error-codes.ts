export const LIMIT_ERROR_CODES = {
  SYSTEM: '[SYSTEM_DAILY_LIMIT]',
  ACCOUNT: '[ACCOUNT_DAILY_LIMIT]',
  CAMPAIGN: '[CAMPAIGN_DAILY_LIMIT]',
} as const;

export const TRANSIENT_ERROR_CODES = {
  QUOTA_CONFLICT: '[QUOTA_TRANSACTION_CONFLICT]',
} as const;

const LEGACY_LIMIT_MESSAGE = 'Daily email limit reached';

const ALL_LIMIT_CODES = Object.values(LIMIT_ERROR_CODES);
const ALL_TRANSIENT_CODES = Object.values(TRANSIENT_ERROR_CODES);

export function isLimitError(message: string | null | undefined): boolean {
  if (!message) return false;
  if (ALL_LIMIT_CODES.some((code) => message.startsWith(code))) return true;
  return message.includes(LEGACY_LIMIT_MESSAGE);
}

export function isTransientError(message: string | null | undefined): boolean {
  if (!message) return false;
  return ALL_TRANSIENT_CODES.some((code) => message.startsWith(code));
}

export function stripErrorCode(message: string | null | undefined): string {
  if (!message) return '';
  for (const code of [...ALL_LIMIT_CODES, ...ALL_TRANSIENT_CODES]) {
    if (message.startsWith(code)) {
      return message.slice(code.length).trim();
    }
  }
  return message;
}
