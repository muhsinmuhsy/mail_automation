import { describe, it, expect, vi } from 'vitest';

const mockAuth = {
  signOut: vi.fn(),
};

vi.mock('@/lib/auth/neon-auth', () => ({
  auth: mockAuth,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('signOut', () => {
  it('calls auth.signOut and redirects to /login on success', async () => {
    mockAuth.signOut.mockResolvedValue({ data: null, error: null });
    const { redirect } = await import('next/navigation');
    const { signOut } = await import('@/app/(auth)/logout/actions');

    await signOut();

    expect(mockAuth.signOut).toHaveBeenCalledWith();
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('returns the error message when sign out fails', async () => {
    mockAuth.signOut.mockResolvedValue({ data: null, error: { message: 'Session expired' } });
    const { redirect } = await import('next/navigation');
    const { signOut } = await import('@/app/(auth)/logout/actions');

    const result = await signOut();

    expect(result?.error).toBe('Session expired');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('returns a fallback error message when the error has no message', async () => {
    mockAuth.signOut.mockResolvedValue({ data: null, error: {} });
    const { redirect } = await import('next/navigation');
    const { signOut } = await import('@/app/(auth)/logout/actions');

    const result = await signOut();

    expect(result?.error).toBe('Failed to sign out.');
    expect(redirect).not.toHaveBeenCalled();
  });
});
