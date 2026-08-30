import { auth, getSession } from './neon-auth';
import { getPrisma } from '@/lib/db';
import { AuthenticationError, ForbiddenError, NotFoundError } from '@/lib/errors';

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  emailVerified?: boolean;
};

export type AuthContext = {
  /** Neon Auth session user (id/email/etc). */
  sessionUser: SessionUser;
  /** Authoritative role loaded from the database. */
  role: 'USER' | 'ADMIN';
};

/**
 * Verifies the request has a valid session and returns the session user.
 * Throws an operational AuthenticationError when unauthenticated.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session?.user?.id) {
    throw new AuthenticationError('Please log in to continue.');
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    emailVerified: session.user.emailVerified,
  };
}

/**
 * Loads the user's role from the database (the authoritative source of
 * truth, per the plan). The Neon Auth `session.user.role` claim is treated as
 * untrusted and never used for authorization decisions.
 */
export async function getDbRole(userId: string): Promise<'USER' | 'ADMIN'> {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, is_active: true },
  });
  if (!user) {
    throw new NotFoundError('User record not found.');
  }
  if (!user.is_active) {
    throw new ForbiddenError('Your account is inactive.');
  }
  return user.role;
}

/**
 * Ensures the current user is authenticated and is an ADMIN.
 */
export async function requireAdmin(): Promise<AuthContext> {
  const sessionUser = await requireUser();
  const role = await getDbRole(sessionUser.id);
  if (role !== 'ADMIN') {
    throw new ForbiddenError('Administrator access is required.');
  }
  return { sessionUser, role };
}

/**
 * Ensures the current user owns (or is allowed to access) a resource, or is an
 * ADMIN. `ownerId` is the `user_id` stored on the resource row.
 */
export async function requireOwnership(ownerId: string): Promise<AuthContext> {
  const sessionUser = await requireUser();
  const role = await getDbRole(sessionUser.id);
  if (role !== 'ADMIN' && sessionUser.id !== ownerId) {
    throw new ForbiddenError('You do not have access to this resource.');
  }
  return { sessionUser, role };
}

/**
 * Returns true when a session user is allowed to act on `ownerId` (admin or
 * owner). Non-throwing variant of {@link requireOwnership}.
 */
export async function canAccess(ownerId: string): Promise<boolean> {
  try {
    const sessionUser = await requireUser();
    const role = await getDbRole(sessionUser.id);
    return role === 'ADMIN' || sessionUser.id === ownerId;
  } catch {
    return false;
  }
}

export { auth };
