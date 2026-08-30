import { RateLimitError } from '@/lib/errors';
import {
  createRateLimitStore,
  resolveRateLimitRule,
  type RateLimitStore,
} from './index';

let store: RateLimitStore = createRateLimitStore(
  (typeof process !== 'undefined' ? (process.env as Record<string, unknown>) : {})
);

/** Override the active rate-limit store (primarily for tests). */
export function setRateLimitStore(s: RateLimitStore): void {
  store = s;
}

export function getRateLimitStore(): RateLimitStore {
  return store;
}

/**
 * Enforces the rate limit for `ruleKey` scoped to `identifier`. Throws a
 * {@link RateLimitError} (HTTP 429) when the budget is exhausted.
 */
export async function enforceRateLimit(
  identifier: string,
  ruleKey: string
): Promise<void> {
  const rule = resolveRateLimitRule(ruleKey);
  const result = await store.check(
    `rl:${identifier}:${ruleKey}`,
    rule.limit,
    rule.windowSec
  );
  if (!result.success) {
    const nowSec = Math.floor(Date.now() / 1000);
    throw new RateLimitError(
      "You're doing that too frequently. Please wait a moment and try again.",
      Math.max(0, result.reset - nowSec)
    );
  }
}
