import { describe, it, expect, vi } from 'vitest';

const mockAuth = {
  signUp: {
    email: vi.fn(),
  },
  signIn: {
    email: vi.fn(),
  },
  sendVerificationEmail: vi.fn(),
};

vi.mock('@/lib/auth/neon-auth', () => ({
  auth: mockAuth,
  getSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('auth page server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signUpWithEmail', () => {
    it('returns error when fields are missing', async () => {
      const { signUpWithEmail } = await import('@/app/(auth)/register/actions');
      const formData = new FormData();
      formData.append('email', '');
      formData.append('name', '');
      formData.append('password', '');

      const result = await signUpWithEmail(null, formData);
      expect(result.error).toBe('All fields are required.');
      expect(mockAuth.signUp.email).not.toHaveBeenCalled();
    });

    it('calls auth.signUp.email with form data', async () => {
      const { signUpWithEmail } = await import('@/app/(auth)/register/actions');
      mockAuth.signUp.email.mockResolvedValue({ data: null, error: null });
      const formData = new FormData();
      formData.append('email', 'test@example.com');
      formData.append('name', 'Test User');
      formData.append('password', 'password123');

      const result = await signUpWithEmail(null, formData);
      expect(mockAuth.signUp.email).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      });
      expect(result).toBeUndefined();
    });

    it('returns error when sign up fails', async () => {
      const { signUpWithEmail } = await import('@/app/(auth)/register/actions');
      mockAuth.signUp.email.mockResolvedValue({ data: null, error: { message: 'Email already exists' } });
      const formData = new FormData();
      formData.append('email', 'test@example.com');
      formData.append('name', 'Test User');
      formData.append('password', 'password123');

      const result = await signUpWithEmail(null, formData);
      expect(result.error).toBe('Email already exists');
    });
  });

  describe('signInWithEmail', () => {
    it('returns error when fields are missing', async () => {
      const { signInWithEmail } = await import('@/app/(auth)/login/actions');
      const formData = new FormData();
      formData.append('email', '');
      formData.append('password', '');

      const result = await signInWithEmail(null, formData);
      expect(result.error).toBe('Email and password are required.');
      expect(mockAuth.signIn.email).not.toHaveBeenCalled();
    });

    it('calls auth.signIn.email with form data', async () => {
      const { signInWithEmail } = await import('@/app/(auth)/login/actions');
      mockAuth.signIn.email.mockResolvedValue({ data: null, error: null });
      const formData = new FormData();
      formData.append('email', 'test@example.com');
      formData.append('password', 'password123');

      const result = await signInWithEmail(null, formData);
      expect(mockAuth.signIn.email).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result).toBeUndefined();
    });

    it('returns error when sign in fails', async () => {
      const { signInWithEmail } = await import('@/app/(auth)/login/actions');
      mockAuth.signIn.email.mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } });
      const formData = new FormData();
      formData.append('email', 'test@example.com');
      formData.append('password', 'wrongpassword');

      const result = await signInWithEmail(null, formData);
      expect(result.error).toBe('Invalid credentials');
    });
  });

  describe('sendVerificationEmail', () => {
    it('returns error when not logged in', async () => {
      const { sendVerificationEmail } = await import('@/app/(auth)/verify-email/actions');
      const neonAuth = await import('@/lib/auth/neon-auth');
      vi.mocked(neonAuth.getSession).mockResolvedValue(null);

      const result = await sendVerificationEmail(new FormData());
      expect(result.error).toBe('You must be logged in to request a verification email.');
      expect(mockAuth.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('calls auth.sendVerificationEmail with user email and redirects', async () => {
      const { sendVerificationEmail } = await import('@/app/(auth)/verify-email/actions');
      const { redirect } = await import('next/navigation');
      const neonAuth = await import('@/lib/auth/neon-auth');
      vi.mocked(neonAuth.getSession).mockResolvedValue({
        user: { email: 'test@example.com' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      mockAuth.sendVerificationEmail.mockResolvedValue({ data: null, error: null });

      const result = await sendVerificationEmail(new FormData());
      expect(mockAuth.sendVerificationEmail).toHaveBeenCalledWith({
        email: 'test@example.com',
      });
      expect(redirect).toHaveBeenCalledWith('/verify-email?sent=1');
      expect(result).toBeUndefined();
    });

    it('returns error when sending fails', async () => {
      const { sendVerificationEmail } = await import('@/app/(auth)/verify-email/actions');
      const neonAuth = await import('@/lib/auth/neon-auth');
      vi.mocked(neonAuth.getSession).mockResolvedValue({
        user: { email: 'test@example.com' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      mockAuth.sendVerificationEmail.mockResolvedValue({ data: null, error: { message: 'Too many requests' } });

      const result = await sendVerificationEmail(new FormData());
      expect(result.error).toBe('Too many requests');
    });
  });
});
