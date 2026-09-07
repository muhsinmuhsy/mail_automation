'use server';
import { auth } from '@/lib/auth/neon-auth';
import { redirect } from 'next/navigation';

export async function signOut() {
  const { error } = await auth.signOut();

  if (error) {
    return { error: error.message || 'Failed to sign out.' };
  }

  redirect('/login');
}
