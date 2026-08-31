import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireVerifiedSession = vi.fn();

vi.mock('@/lib/auth/neon-auth', () => ({
  requireVerifiedSession: (...a: unknown[]) => mockRequireVerifiedSession(...a),
}));

import { requireVerifiedUser } from '@/lib/api/session';
import { AuthenticationError, ForbiddenError } from '@/lib/errors';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('lib/api/session', () => {
  it('returns the user on a verified session', async () => {
    const user = { id: 'u1', email: 'a@b.c', emailVerified: true };
    mockRequireVerifiedSession.mockResolvedValue({ session: { user } });
    const result = await requireVerifiedUser();
    expect(result).toEqual(user);
  });

  it('throws AuthenticationError when there is no session', async () => {
    mockRequireVerifiedSession.mockResolvedValue({
      error: { type: 'AUTHENTICATION_ERROR', message: 'Please log in to continue.' },
    });
    await expect(requireVerifiedUser()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('throws ForbiddenError when the email is unverified', async () => {
    mockRequireVerifiedSession.mockResolvedValue({
      error: { type: 'AUTHORIZATION_ERROR', message: 'Please verify your email address to continue.' },
    });
    await expect(requireVerifiedUser()).rejects.toBeInstanceOf(ForbiddenError);
  });
});
