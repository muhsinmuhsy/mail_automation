export type RateLimitRule = { limit: number; windowSec: number };

/**
 * Per-endpoint rate limit configuration. Keys are `<group>:<action>`.
 * The API layer resolves a key for each route; if no rule exists the
 * `default` rule is used. Windows are expressed in seconds.
 */
export const RATE_LIMITS: Record<string, RateLimitRule> = {
  'auth:sign-in': { limit: 10, windowSec: 60 },
  'auth:sign-up': { limit: 5, windowSec: 60 },
  'auth:password-reset': { limit: 5, windowSec: 60 },
  'auth:verify-email': { limit: 10, windowSec: 60 },

  'contacts:list': { limit: 60, windowSec: 60 },
  'contacts:create': { limit: 30, windowSec: 60 },
  'contacts:import': { limit: 5, windowSec: 60 },
  'contacts:update': { limit: 30, windowSec: 60 },
  'contacts:delete': { limit: 30, windowSec: 60 },

  'campaigns:list': { limit: 60, windowSec: 60 },
  'campaigns:create': { limit: 10, windowSec: 60 },
  'campaigns:launch': { limit: 5, windowSec: 60 },
  'campaigns:update': { limit: 20, windowSec: 60 },
  'campaigns:pause': { limit: 20, windowSec: 60 },
  'campaigns:cancel': { limit: 20, windowSec: 60 },

  'attachments:upload': { limit: 20, windowSec: 60 },
  'attachments:delete': { limit: 20, windowSec: 60 },

  'email-accounts:create': { limit: 10, windowSec: 60 },
  'email-accounts:delete': { limit: 10, windowSec: 60 },

  'admin:users': { limit: 60, windowSec: 60 },
  'admin:settings': { limit: 30, windowSec: 60 },

  'send:single': { limit: 30, windowSec: 60 },

  default: { limit: 120, windowSec: 60 },
};

export function resolveRateLimitRule(key: string): RateLimitRule {
  return RATE_LIMITS[key] ?? RATE_LIMITS.default;
}

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  reset: number;
  limit: number;
};

export interface RateLimitStore {
  check(key: string, limit: number, windowSec: number): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

/** Fixed-window in-memory store. Suitable for single-instance and tests. */
export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { window: number; count: number }>();

  async check(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const nowSec = Math.floor(Date.now() / 1000);
    const window = Math.floor(nowSec / windowSec);
    const bucketKey = `${key}:${window}`;
    const bucket = this.buckets.get(bucketKey);

    if (!bucket || bucket.window !== window) {
      this.buckets.set(bucketKey, { window, count: 0 });
    }

    const current = this.buckets.get(bucketKey)!;
    const reset = (window + 1) * windowSec;

    if (current.count >= limit) {
      return { success: false, remaining: 0, reset, limit };
    }

    current.count += 1;
    return { success: true, remaining: limit - current.count, reset, limit };
  }

  async reset(key: string): Promise<void> {
    for (const k of [...this.buckets.keys()]) {
      if (k.startsWith(`${key}:`)) {
        this.buckets.delete(k);
      }
    }
  }
}

/**
 * Returns a rate limit store. If a Cloudflare KV/Durable Object binding is
 * present it is used directly; otherwise a per-process in-memory store is
 * returned. The `env` shape is the Worker/Pages `env` object.
 */
/**
 * Detects a Cloudflare Rate Limit API binding (Wrangler 4.36.0+, binding type
 * `ratelimit`). The binding exposes `limit({ key })` and returns `{ success }`;
 * it enforces the limit configured in `wrangler.toml`, so the `limit`/`window`
 * arguments are ignored on that path. When no binding is present (local dev /
 * tests) a per-process in-memory store is returned.
 */
function asCloudflareBinding(
  env: Record<string, unknown>,
  bindingName: string
): { limit: (options: { key: string }) => Promise<{ success: boolean }> } | undefined {
  const binding = env[bindingName] as
    | { limit?: unknown }
    | undefined;
  if (binding && typeof binding.limit === 'function') {
    return binding as { limit: (options: { key: string }) => Promise<{ success: boolean }> };
  }
  return undefined;
}

export function createRateLimitStore(
  env: Record<string, unknown> = {},
  bindingName = 'RATE_LIMITER'
): RateLimitStore {
  const binding = asCloudflareBinding(env, bindingName);
  if (binding) {
    return {
      check: async (key) => {
        const outcome = await binding.limit({ key });
        return { success: outcome.success, remaining: 0, reset: 0, limit: 0 };
      },
      reset: async () => undefined,
    };
  }
  return new MemoryRateLimitStore();
}

/* ---------------------------------------------------------------------------
 * Legacy compatibility helper (used by proxy.ts and lib/rate-limit/api.ts).
 * Prefer the per-endpoint config above for new code.
 * ------------------------------------------------------------------------- */

export type RateLimiter = {
  check: (key: string, limit?: number, window?: number) => Promise<{ success: boolean; remaining?: number; reset?: number }>;
};

export function createRateLimiter(env: Record<string, unknown>, bindingName: string): RateLimiter {
  const binding = asCloudflareBinding(env, bindingName);
  if (binding) {
    return {
      check: async (key) => {
        const outcome = await binding.limit({ key });
        return { success: outcome.success };
      },
    };
  }

  const store = new MemoryRateLimitStore();
  return {
    check: (key: string, limit?: number, window?: number) =>
      store.check(key, limit ?? 60, window ?? 60),
  };
}
