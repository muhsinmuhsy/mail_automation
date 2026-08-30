import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MemoryRateLimitStore,
  resolveRateLimitRule,
  createRateLimitStore,
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
