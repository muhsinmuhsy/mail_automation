import { NextRequest, NextResponse } from 'next/server';
import { createRateLimiter } from '@/lib/rate-limit';

const apiRateLimiter = createRateLimiter(
  process.env as unknown as Record<string, unknown>,
  'RATE_LIMITER_API'
);

export async function checkApiRateLimit(request: NextRequest, userId: string, endpoint: string): Promise<NextResponse | null> {
  const key = `user:${userId}:${endpoint}`;
  const result = await apiRateLimiter.check(key, 100, 60);
  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          type: 'RATE_LIMITED',
          message: "You're doing that too frequently. Please wait a moment and try again.",
          retryAfter: result.reset,
        },
      },
      { status: 429 }
    );
  }
  return null;
}
