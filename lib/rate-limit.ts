export type RateLimiter = {
  check: (key: string, limit: number, window: number) => Promise<{ success: boolean; remaining?: number; reset?: number }>;
};

export function createRateLimiter(env: Record<string, unknown>, bindingName: string): RateLimiter {
  const binding = env[bindingName] as
    | {
        check: (key: string, limit: number, window: number) => Promise<{ success: boolean; remaining?: number; reset?: number }>;
      }
    | undefined;

  if (!binding) {
    return {
      check: async () => ({ success: true }),
    };
  }

  return {
    check: (key: string, limit: number, window: number) =>
      binding.check(key, limit, window),
  };
}
