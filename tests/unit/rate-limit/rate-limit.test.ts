import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MemoryRateLimitStore,
  resolveRateLimitRule,
  createRateLimitStore,
  createRateLimiter,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { enforceRateLimit, setRateLimitStore } from '@/lib/rate-limit/middleware';
import { RateLimitError } from '@/lib/errors';

describe('lib/rate-limit', () => {
  it('resolves configured and default rules', () => {
    expect(resolveRateLimitRule('contacts:create')).toEqual(RATE_LIMITS['contacts:create']);
    expect(resolveRateLimitRule('unknown:key')).toEqual(RATE_LIMITS.default);
  });

  it('MemoryRateLimitStore enforces a fixed window', async () => {
    const store = new MemoryRateLimitStore();
    const first = await store.check('k', 2, 60);
    expect(first.success).toBe(true);
    expect(first.remaining).toBe(1);

    const second = await store.check('k', 2, 60);
    expect(second.success).toBe(true);
    expect(second.remaining).toBe(0);

    const third = await store.check('k', 2, 60);
    expect(third.success).toBe(false);
  });

  it('createRateLimitStore falls back to memory when no binding', () => {
    const store = createRateLimitStore({});
    expect(store).toBeInstanceOf(MemoryRateLimitStore);
  });

  it('createRateLimitStore delegates to a Cloudflare rate-limit binding', async () => {
    const calls: string[] = [];
    const binding = {
      limit: async (opts: { key: string }) => {
        calls.push(opts.key);
        return { success: !opts.key.includes('block') };
      },
    };
    const store = createRateLimitStore({ RATE_LIMITER: binding }, 'RATE_LIMITER');

    expect((await store.check('user:1:contacts', 10, 60)).success).toBe(true);
    expect((await store.check('block', 10, 60)).success).toBe(false);
    expect(calls).toEqual(['user:1:contacts', 'block']);
  });

  it('createRateLimiter uses the Cloudflare binding and enforces in-memory fallback otherwise', async () => {
    const binding = { limit: async (opts: { key: string }) => ({ success: opts.key !== 'block' }) };
    const limiter = createRateLimiter({ RATE_LIMITER_API: binding }, 'RATE_LIMITER_API');
    expect((await limiter.check('fine')).success).toBe(true);
    expect((await limiter.check('block')).success).toBe(false);

    const fallback = createRateLimiter({}, 'RATE_LIMITER_API');
    expect((await fallback.check('k', 1, 60)).success).toBe(true);
    expect((await fallback.check('k', 1, 60)).success).toBe(false);
  });

  it('enforceRateLimit throws RateLimitError after budget exhausted', async () => {
    setRateLimitStore(new MemoryRateLimitStore());
    // auth:sign-in limit is 10
    for (let i = 0; i < 10; i++) {
      await enforceRateLimit('user-1', 'auth:sign-in');
    }
    await expect(enforceRateLimit('user-1', 'auth:sign-in')).rejects.toBeInstanceOf(RateLimitError);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });
});
