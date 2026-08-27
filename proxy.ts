import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/neon-auth';
import { ensureUserProfile } from '@/lib/auth/user-provisioning';
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
    const key = `auth:${getRateLimitKey(request)}:${pathname}`;
    const result = await authRateLimiter.check(key, 10, 600);
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
    ensureUserProfile(sessionResult.data.user.id, sessionResult.data.user.email, sessionResult.data.user.name).catch(() => {});

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
