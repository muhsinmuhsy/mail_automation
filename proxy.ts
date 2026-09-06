import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/neon-auth';
import { createRateLimiter } from '@/lib/rate-limit';

const neonAuthMiddleware = auth.middleware({
  loginUrl: '/login',
});

const authRateLimiter = createRateLimiter(
  process.env as unknown as Record<string, unknown>,
  'RATE_LIMITER_AUTH'
);

const apiRateLimiter = createRateLimiter(
  process.env as unknown as Record<string, unknown>,
  'RATE_LIMITER_API'
);

function isUnauthenticatedPath(pathname: string): boolean {
  return (
    pathname === '/api/health' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/verify-email') ||
    pathname.startsWith('/api/auth')
  );
}

function getRateLimitKey(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
  return ip;
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isUnauthenticatedPath(pathname)) {
    // Page loads and Next.js prefetches are not authentication attempts.
    // Keep credential endpoints and server-action POSTs on the strict limiter.
    const publicRead = ['GET', 'HEAD'].includes(request.method) && !pathname.startsWith('/api/auth');
    const key = `${publicRead ? 'public-page' : 'auth'}:${getRateLimitKey(request)}:${pathname}`;
    const result = publicRead
      ? await apiRateLimiter.check(key, 120, 60)
      : await authRateLimiter.check(key, 10, 600);
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

    return NextResponse.next();
  }

  const sessionResult = await auth.getSession();
  if (sessionResult?.data?.user) {
    if (!sessionResult.data.user.emailVerified) {
      const verifyUrl = new URL('/verify-email', request.url);
      if (pathname !== '/verify-email') {
        return NextResponse.redirect(verifyUrl);
      }
    }
  }

  const response = await neonAuthMiddleware(request);

  if (sessionResult?.data?.user && pathname.startsWith('/api/')) {
    const key = `user:${sessionResult.data.user.id}:${pathname}`;
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
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
