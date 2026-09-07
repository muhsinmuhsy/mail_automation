import { describe, it, /* expect, */ vi } from 'vitest';

const mockAuth = {
  signUp: {
    email: vi.fn(),
  },
  signIn: {
    email: vi.fn(),
  },
  sendVerificationEmail: vi.fn(),
  emailOtp: {
    verifyEmail: vi.fn(),
  },
};

const mockGetSession = vi.fn();

vi.mock('@/lib/auth/neon-auth', () => ({
  auth: mockAuth,
  getSession: mockGetSession,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('auth page server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
  });

  it.skip('auth page actions disabled — only Continue with Google is active', () => {});

  // describe('signUpWithEmail', () => {
  //   it('returns error when fields are missing', async () => {
  //     const { signUpWithEmail } = await import('@/app/(auth)/register/actions');
  //     const formData = new FormData();
  //     formData.append('email', '');
  //     formData.append('name', '');
  //     formData.append('password', '');
  //
  //     const result = await signUpWithEmail(null, formData);
  //     expect(result.error).toBe('All fields are required.');
  //     expect(mockAuth.signUp.email).not.toHaveBeenCalled();
  //   });
  //
  //   it('calls auth.signUp.email with form data and sends verification email', async () => {
  //     const { signUpWithEmail } = await import('@/app/(auth)/register/actions');
  //     const { redirect } = await import('next/navigation');
  //     mockAuth.signUp.email.mockResolvedValue({ data: null, error: null });
  //     mockAuth.sendVerificationEmail.mockResolvedValue({ data: null, error: null });
  //     const formData = new FormData();
  //     formData.append('email', 'test@example.com');
  //     formData.append('name', 'Test User');
  //     formData.append('password', 'password123');
  //
  //     const result = await signUpWithEmail(null, formData);
  //     expect(mockAuth.signUp.email).toHaveBeenCalledWith({
  //       email: 'test@example.com',
  //       name: 'Test User',
  //       password: 'password123',
  //     });
  //     expect(mockAuth.sendVerificationEmail).toHaveBeenCalledWith({
  //       email: 'test@example.com',
  //     });
  //     expect(redirect).toHaveBeenCalledWith('/verify-email');
  //     expect(result).toBeUndefined();
  //   });
  //
  //   it('returns error when sign up fails', async () => {
  //     const { signUpWithEmail } = await import('@/app/(auth)/register/actions');
  //     mockAuth.signUp.email.mockResolvedValue({ data: null, error: { message: 'Email already exists' } });
  //     const formData = new FormData();
  //     formData.append('email', 'test@example.com');
  //     formData.append('name', 'Test User');
  //     formData.append('password', 'password123');
  //
  //     const result = await signUpWithEmail(null, formData);
  //     expect(result.error).toBe('Email already exists');
  //   });
  //
  //   it('returns error when verification email send fails', async () => {
  //     const { signUpWithEmail } = await import('@/app/(auth)/register/actions');
  //     mockAuth.signUp.email.mockResolvedValue({ data: null, error: null });
  //     mockAuth.sendVerificationEmail.mockResolvedValue({ data: null, error: { message: 'SMTP error' } });
  //     const formData = new FormData();
  //     formData.append('email', 'test@example.com');
  //     formData.append('name', 'Test User');
  //     formData.append('password', 'password123');
  //
  //     const result = await signUpWithEmail(null, formData);
  //     expect(result.error).toBe('SMTP error');
  //     expect(mockAuth.sendVerificationEmail).toHaveBeenCalledWith({
  //       email: 'test@example.com',
  //     });
  //   });
  // });

  // describe('signInWithEmail', () => {
  //   it('returns error when fields are missing', async () => {
  //     const { signInWithEmail } = await import('@/app/(auth)/login/actions');
  //     const formData = new FormData();
  //     formData.append('email', '');
  //     formData.append('password', '');
  //
  //     const result = await signInWithEmail(null, formData);
  //     expect(result.error).toBe('Email and password are required.');
  //     expect(mockAuth.signIn.email).not.toHaveBeenCalled();
  //   });
  //
  //   it('calls auth.signIn.email with form data', async () => {
  //     const { signInWithEmail } = await import('@/app/(auth)/login/actions');
  //     mockAuth.signIn.email.mockResolvedValue({ data: null, error: null });
  //     const formData = new FormData();
  //     formData.append('email', 'test@example.com');
  //     formData.append('password', 'password123');
  //
  //     const result = await signInWithEmail(null, formData);
  //     expect(mockAuth.signIn.email).toHaveBeenCalledWith({
  //       email: 'test@example.com',
  //       password: 'password123',
  //     });
  //     expect(result).toBeUndefined();
  //   });
  //
  //   it('returns error when sign in fails', async () => {
  //     const { signInWithEmail } = await import('@/app/(auth)/login/actions');
  //     mockAuth.signIn.email.mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } });
  //     const formData = new FormData();
  //     formData.append('email', 'test@example.com');
  //     formData.append('password', 'wrongpassword');
  //
  //     const result = await signInWithEmail(null, formData);
  //     expect(result.error).toBe('Invalid credentials');
  //   });
  // });

  // describe('verifyOtp', () => {
  //   it('returns error when not logged in', async () => {
  //     mockGetSession.mockResolvedValue(null);
  //
  //     const { verifyOtp } = await import('@/app/(auth)/verify-email/actions');
  //     const result = await verifyOtp(null, new FormData());
  //     expect(result.error).toBe('You must be logged in to verify your email.');
  //     expect(mockAuth.emailOtp.verifyEmail).not.toHaveBeenCalled();
  //   });
  //
  //   it('returns error when token is missing', async () => {
  //     mockGetSession.mockResolvedValue({ user: { email: 'test@example.com' } });
  //
  //     const { verifyOtp } = await import('@/app/(auth)/verify-email/actions');
  //     const result = await verifyOtp(null, new FormData());
  //     expect(result.error).toBe('Please enter the verification code.');
  //     expect(mockAuth.emailOtp.verifyEmail).not.toHaveBeenCalled();
  //   });
  //
  //   it('verifies OTP and redirects to dashboard', async () => {
  //     const { verifyOtp } = await import('@/app/(auth)/verify-email/actions');
  //     const { redirect } = await import('next/navigation');
  //     mockGetSession.mockResolvedValue({ user: { email: 'test@example.com' } });
  //     mockAuth.emailOtp.verifyEmail.mockResolvedValue({ data: null, error: null });
  //
  //     const formData = new FormData();
  //     formData.append('token', '7431888');
  //     const result = await verifyOtp(null, formData);
  //     expect(mockAuth.emailOtp.verifyEmail).toHaveBeenCalledWith({
  //       email: 'test@example.com',
  //       otp: '7431888',
  //     });
  //     expect(redirect).toHaveBeenCalledWith('/dashboard');
  //     expect(result).toBeUndefined();
  //   });
  //
  //   it('returns error for invalid OTP', async () => {
  //     const { verifyOtp } = await import('@/app/(auth)/verify-email/actions');
  //     mockGetSession.mockResolvedValue({ user: { email: 'test@example.com' } });
  //     mockAuth.emailOtp.verifyEmail.mockResolvedValue({ data: null, error: { message: 'Invalid code' } });
  //
  //     const formData = new FormData();
  //     formData.append('token', '000000');
  //     const result = await verifyOtp(null, formData);
  //     expect(result.error).toBe('Invalid code');
  //   });
  // });

  // describe('sendVerificationEmail', () => {
  //   it('returns error when not logged in', async () => {
  //     mockGetSession.mockResolvedValue(null);
  //
  //     const { sendVerificationEmail } = await import('@/app/(auth)/verify-email/actions');
  //     const result = await sendVerificationEmail();
  //     expect(result.error).toBe('You must be logged in to request a verification email.');
  //     expect(mockAuth.sendVerificationEmail).not.toHaveBeenCalled();
  //   });
  //
  //   it('calls auth.sendVerificationEmail with user email and redirects', async () => {
  //     const { sendVerificationEmail } = await import('@/app/(auth)/verify-email/actions');
  //     const { redirect } = await import('next/navigation');
  //     mockGetSession.mockResolvedValue({ user: { email: 'test@example.com' } });
  //     mockAuth.sendVerificationEmail.mockResolvedValue({ data: null, error: null });
  //
  //     const result = await sendVerificationEmail();
  //     expect(mockAuth.sendVerificationEmail).toHaveBeenCalledWith({
  //       email: 'test@example.com',
  //     });
  //     expect(redirect).toHaveBeenCalledWith('/verify-email?sent=1');
  //     expect(result).toBeUndefined();
  //   });
  //
  //   it('returns error when sending fails', async () => {
  //     const { sendVerificationEmail } = await import('@/app/(auth)/verify-email/actions');
  //     mockGetSession.mockResolvedValue({ user: { email: 'test@example.com' } });
  //     mockAuth.sendVerificationEmail.mockResolvedValue({ data: null, error: { message: 'Too many requests' } });
  //
  //     const result = await sendVerificationEmail();
  //     expect(result.error).toBe('Too many requests');
  //   });
  // });
});
