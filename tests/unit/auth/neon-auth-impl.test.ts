import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockCreateNeonAuth: vi.fn((...a: unknown[]) => {
    const opts = a[0];
    return { __opts: opts, getSession: (...g: unknown[]) => mocks.mockGetSession(...g) };
  }),
}));

vi.mock('@neondatabase/auth/next/server', () => ({
  createNeonAuth: (...a: unknown[]) => mocks.mockCreateNeonAuth(...a),
}));

import { getSession, requireVerifiedSession } from '@/lib/auth/neon-auth';

beforeEach(() => {
  mocks.mockGetSession.mockClear();
});

describe('lib/auth/neon-auth (implementation)', () => {
  it('creates the auth client from env configuration', () => {
    expect(mocks.mockCreateNeonAuth).toHaveBeenCalledWith({
      baseUrl: process.env.NEON_AUTH_BASE_URL,
      cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET },
    });
  });

  describe('getSession', () => {
    it('returns the session data when a user is present', async () => {
      mocks.mockGetSession.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c' } } });
      const result = await getSession();
      expect(result).toEqual({ user: { id: 'u1', email: 'a@b.c' } });
    });

    it('returns null when there is no user', async () => {
      mocks.mockGetSession.mockResolvedValue({ data: { user: null } });
      expect(await getSession()).toBeNull();

      mocks.mockGetSession.mockResolvedValue({ data: null });
      expect(await getSession()).toBeNull();
    });

    it('logs and rethrows when getSession throws', async () => {
      const boom = new Error('neon down');
      mocks.mockGetSession.mockRejectedValue(boom);
      await expect(getSession()).rejects.toBe(boom);
    });
  });

  describe('requireVerifiedSession', () => {
    it('returns an AUTHENTICATION_ERROR when there is no session', async () => {
      mocks.mockGetSession.mockResolvedValue({ data: { user: null } });
      const result = await requireVerifiedSession();
      expect('error' in result && result.error?.type).toBe('AUTHENTICATION_ERROR');
    });

    it('returns an AUTHORIZATION_ERROR when email is unverified', async () => {
      mocks.mockGetSession.mockResolvedValue({
        data: { user: { id: 'u1', email: 'a@b.c', emailVerified: false } },
      });
      const result = await requireVerifiedSession();
      expect('error' in result && result.error?.type).toBe('AUTHORIZATION_ERROR');
    });

    it('returns the session when the user is verified', async () => {
      const data = { user: { id: 'u1', email: 'a@b.c', emailVerified: true } };
      mocks.mockGetSession.mockResolvedValue({ data });
      const result = await requireVerifiedSession();
      expect('session' in result && result.session).toEqual(data);
    });

    it('logs and rethrows when getSession throws', async () => {
      const boom = new Error('boom');
      mocks.mockGetSession.mockRejectedValue(boom);
      await expect(requireVerifiedSession()).rejects.toBe(boom);
    });
  });
});
