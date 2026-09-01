import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { ensureSessionUserProfile } from '@/lib/auth/guards';
import { AuthenticationError, ForbiddenError } from '@/lib/errors';

export type AuthedUser = {
  id: string;
  email: string;
  name?: string | null;
  emailVerified?: boolean;
};

/**
 * Resolves the authenticated, email-verified user for an API request.
 *
 * Verification status is read from the Neon Auth server session (never from
 * browser-supplied fields). Unauthenticated requests throw
 * `AuthenticationError` (401) and unverified-but-authenticated requests throw
 * `ForbiddenError` (403), matching the plan's unverified-user restrictions.
 */
export async function requireVerifiedUser(): Promise<AuthedUser> {
  const result = await requireVerifiedSession();
  if ('error' in result && result.error) {
    if (result.error.type === 'AUTHENTICATION_ERROR') {
      throw new AuthenticationError(result.error.message);
    }
    throw new ForbiddenError(result.error.message);
  }
  const user = result.session.user;
  await ensureSessionUserProfile(user);
  return user;
}
