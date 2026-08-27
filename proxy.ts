import { auth } from '@/lib/auth/neon-auth';

export default auth.middleware({
  loginUrl: '/login',
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
