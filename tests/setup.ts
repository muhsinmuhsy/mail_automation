import { vi, beforeEach, afterEach } from 'vitest';

/**
 * Global test setup.
 *
 * - Provides deterministic environment variables so modules that read
 *   `process.env` at import time behave predictably.
 * - Installs `@testing-library/jest-dom` matchers when running in jsdom.
 * - Silences expected console noise while still allowing assertions on it.
 */

process.env.NEON_AUTH_BASE_URL ??= 'https://auth.test.local';
process.env.NEON_AUTH_COOKIE_SECRET ??= 'test-cookie-secret-that-is-long-enough-32';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.SMTP_ENCRYPTION_KEY ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
process.env.B2_BUCKET_NAME ??= 'test-bucket';
process.env.B2_REGION ??= 'us-west-004';
process.env.B2_ENDPOINT ??= 'https://s3.us-west-004.backblazeb2.com';
process.env.B2_KEY_ID ??= 'test-key-id';
process.env.B2_APPLICATION_KEY ??= 'test-application-key';
process.env.APP_VERSION ??= '1.0.0';

if (typeof globalThis.window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');

  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});
