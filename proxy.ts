import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/neon-auth';
import { ensureUserProfile } from '@/lib/auth/user-provisioning';

const neonAuthMiddleware = auth.middleware({
  loginUrl: '/login',
});

export default async function proxy(request: NextRequest) {
  const sessionResult = await auth.getSession();
  if (sessionResult?.data?.user) {
    ensureUserProfile(sessionResult.data.user.id, sessionResult.data.user.email, sessionResult.data.user.name).catch(() => {});
  }

  return neonAuthMiddleware(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
