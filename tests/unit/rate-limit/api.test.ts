import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type RateLimitedBody = {
  success: boolean;
  error: { type: string; message: string; retryAfter: number };
};

const mocks = vi.hoisted(() => ({
  rateLimiterMock: { check: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: vi.fn(() => mocks.rateLimiterMock),
}));

import { checkApiRateLimit } from '@/lib/rate-limit/api';

function req() {
  return new NextRequest('https://api.test/x');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('lib/rate-limit/api', () => {
  it('returns null when the rate limit is not exceeded', async () => {
    mocks.rateLimiterMock.check.mockResolvedValue({ success: true, reset: 0 });
    const result = await checkApiRateLimit(req(), 'user-1', 'contacts:list');
    expect(result).toBeNull();
    expect(mocks.rateLimiterMock.check).toHaveBeenCalledWith('user:user-1:contacts:list', 100, 60);
  });

  it('returns a 429 body with retryAfter when the budget is exhausted', async () => {
    mocks.rateLimiterMock.check.mockResolvedValue({ success: false, reset: 30 });
    const result = await checkApiRateLimit(req(), 'user-1', 'contacts:create');
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    const body = (await result!.json()) as RateLimitedBody;
    expect(body).toEqual({
      success: false,
      error: {
        type: 'RATE_LIMITED',
        message: "You're doing that too frequently. Please wait a moment and try again.",
        retryAfter: 30,
      },
    });
    expect(result!.headers.get('Retry-After')).toBe('30');
  });

  it('defaults retryAfter to 60 when reset is zero', async () => {
    mocks.rateLimiterMock.check.mockResolvedValue({ success: false, reset: 0 });
    const result = await checkApiRateLimit(req(), 'user-2', 'send:single');
    const body = (await result!.json()) as RateLimitedBody;
    expect(body.error.retryAfter).toBe(60);
    expect(result!.headers.get('Retry-After')).toBe('60');
  });

  it('defaults retryAfter to 60 when reset is missing', async () => {
    mocks.rateLimiterMock.check.mockResolvedValue({ success: false });
    const result = await checkApiRateLimit(req(), 'user-2', 'send:single');
    const body = (await result!.json()) as RateLimitedBody;
    expect(body.error.retryAfter).toBe(60);
  });
});
