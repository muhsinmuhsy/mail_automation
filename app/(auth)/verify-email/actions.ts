'use server';
import { auth, getSession } from '@/lib/auth/neon-auth';
import { redirect } from 'next/navigation';

export async function verifyOtp(
  _prevState: { error: string } | null,
  formData: FormData
) {
  const session = await getSession();
  if (!session?.user?.email) {
    return { error: 'You must be logged in to verify your email.' };
  }

  const token = formData.get('token') as string;
  if (!token) {
    return { error: 'Please enter the verification code.' };
  }

  const { error } = await auth.emailOtp.verifyEmail({
    email: session.user.email,
    otp: token,
  });

  if (error) {
    return { error: error.message || 'Invalid or expired verification code.' };
  }

  redirect('/dashboard');
}

export async function sendVerificationEmail() {
  const session = await getSession();
  if (!session?.user?.email) {
    return { error: 'You must be logged in to request a verification email.' };
  }

  const { error } = await auth.sendVerificationEmail({
    email: session.user.email,
  });
  if (error) {
    return { error: error.message || 'Failed to send verification email' };
  }
  redirect('/verify-email?sent=1');
}
