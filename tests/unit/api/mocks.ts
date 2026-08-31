import { vi } from 'vitest';

const cache = new Map<string, ReturnType<typeof vi.fn>>();

function getFn(key: string): ReturnType<typeof vi.fn> {
  if (!cache.has(key)) {
    cache.set(key, vi.fn(() => Promise.resolve(undefined)));
  }
  return cache.get(key)!;
}

/**
 * Recursive-ish prisma mock. Every `prisma.<model>.<method>(...)` resolves to a
 * cached, independently configurable `vi.fn()` (defaulting to `undefined`).
 * Top-level `$`-methods (e.g. `$transaction`) are exposed as plain `vi.fn`s.
 */
export const prismaMock = new Proxy({} as any, {
  get(_t, prop: string) {
    if (typeof prop !== 'string') return undefined;
    if (prop.startsWith('$')) {
      return getFn(prop);
    }
    return new Proxy({} as any, {
      get(_m, method: string) {
        return getFn(`${prop}.${method}`);
      },
    });
  },
});

export function resetPrisma() {
  for (const fn of cache.values()) fn.mockReset();
}

export function makeReq(opts: { url?: string; json?: unknown; formData?: FormData } = {}) {
  const req: any = {
    url: opts.url ?? 'http://localhost/api',
  };
  if ('json' in opts) req.json = async () => opts.json;
  if (opts.formData) req.formData = async () => opts.formData;
  return req;
}

export function CTX(params: Record<string, string> = {}) {
  return {
    user: { id: 'u1', email: 'owner@example.com' },
    requestId: 'req-test',
    params,
    req: makeReq(),
  } as any;
}

export const UUID = '00000000-0000-0000-0000-000000000001';
