'use server';
// import { auth } from '@/lib/auth/neon-auth';
// import { redirect } from 'next/navigation';

// export async function signInWithEmail(
//   _prevState: { error: string } | null,
//   formData: FormData
// ) {
//   const email = formData.get('email') as string;
//   const password = formData.get('password') as string;
//
//   if (!email || !password) {
//     return { error: 'Email and password are required.' };
//   }
//
//   const { error } = await auth.signIn.email({
//     email,
//     password,
//   });
//
//   if (error) {
//     return { error: error.message || 'Failed to sign in. Try again' };
//   }
//
//   redirect('/dashboard');
// }
