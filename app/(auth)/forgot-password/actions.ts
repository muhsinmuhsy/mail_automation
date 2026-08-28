'use server';
import { auth } from '@/lib/auth/neon-auth';

export async function forgotPassword(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'Email is required.' };
  }

  const { error } = await auth.requestPasswordReset({
    email,
  });

  if (error) {
    return { error: error.message || 'Failed to send reset email. Try again.' };
  }

  return { success: true };
}
