'use server';
import { auth, getSession } from '@/lib/auth/neon-auth';
import { redirect } from 'next/navigation';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function sendVerificationEmail(_formData: FormData) {
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
