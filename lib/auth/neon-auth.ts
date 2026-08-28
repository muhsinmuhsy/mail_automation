import { createNeonAuth } from '@neondatabase/auth/next/server';

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET!,
  },
});

export async function getSession() {
  try {
    const result = await auth.getSession();
    if (!result?.data?.user) {
      return null;
    }
    return result.data;
  } catch (error) {
    console.error('getSession error:', error);
    throw error;
  }
}

export async function requireVerifiedSession() {
  try {
    const session = await getSession();
    if (!session) {
      return { error: { type: 'AUTHENTICATION_ERROR' as const, message: 'Please log in to continue.' } };
    }
    if (!session.user.emailVerified) {
      return { error: { type: 'AUTHORIZATION_ERROR' as const, message: 'Please verify your email address to continue.' } };
    }
    return { session };
  } catch (error) {
    console.error('requireVerifiedSession error:', error);
    throw error;
  }
}
