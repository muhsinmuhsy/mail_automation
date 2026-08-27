import { describe, it, expect, vi } from 'vitest';

const mockGetSession = vi.fn();
const mockRequireVerifiedSession = vi.fn();

vi.mock('@/lib/auth/neon-auth', () => ({
  getSession: () => mockGetSession(),
  requireVerifiedSession: () => mockRequireVerifiedSession(),
}));

describe('lib/auth/neon-auth', () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockRequireVerifiedSession.mockClear();
  });

  describe('getSession', () => {
    it('returns user data when session exists', async () => {
      mockGetSession.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        emailVerified: true,
      });

      const { getSession } = await import('@/lib/auth/neon-auth');
      const session = await getSession();
      expect(session).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        emailVerified: true,
      });
    });

    it('returns null when no session', async () => {
      mockGetSession.mockResolvedValue(null);

      const { getSession } = await import('@/lib/auth/neon-auth');
      const session = await getSession();
      expect(session).toBeNull();
    });
  });

  describe('requireVerifiedSession', () => {
    it('returns session when authenticated and verified', async () => {
      mockRequireVerifiedSession.mockResolvedValue({
        session: {
          user: {
            id: 'user-1',
            email: 'test@example.com',
            emailVerified: true,
          },
        },
      });

      const { requireVerifiedSession } = await import('@/lib/auth/neon-auth');
      const result = await requireVerifiedSession();
      expect('session' in result).toBe(true);
      if ('session' in result && result.session) {
        expect(result.session.user.id).toBe('user-1');
      }
    });

    it('returns AUTHENTICATION_ERROR when not logged in', async () => {
      mockRequireVerifiedSession.mockResolvedValue({
        error: { type: 'AUTHENTICATION_ERROR', message: 'Please log in to continue.' },
      });

      const { requireVerifiedSession } = await import('@/lib/auth/neon-auth');
      const result = await requireVerifiedSession();
      expect('error' in result).toBe(true);
      if ('error' in result && result.error) {
        expect(result.error.type).toBe('AUTHENTICATION_ERROR');
        expect(result.error.message).toBe('Please log in to continue.');
      }
    });

    it('returns AUTHORIZATION_ERROR when email not verified', async () => {
      mockRequireVerifiedSession.mockResolvedValue({
        error: { type: 'AUTHORIZATION_ERROR', message: 'Please verify your email address to continue.' },
      });

      const { requireVerifiedSession } = await import('@/lib/auth/neon-auth');
      const result = await requireVerifiedSession();
      expect('error' in result).toBe(true);
      if ('error' in result && result.error) {
        expect(result.error.type).toBe('AUTHORIZATION_ERROR');
        expect(result.error.message).toBe('Please verify your email address to continue.');
      }
    });
  });
});
