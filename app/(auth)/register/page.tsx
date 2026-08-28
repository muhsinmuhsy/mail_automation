'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { signUpWithEmail } from './actions';

export default function RegisterPage() {
  const [state, action, isPending] = useActionState(signUpWithEmail, null);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-page-title font-semibold tracking-tight">Create your account</h1>
        <p className="mt-2 text-body text-text-secondary">
          Get started with Mail Automation
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          href="/api/auth/sign-in/social/google"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-text-primary shadow-sm hover:bg-surface active:scale-[0.98] transition-all"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-caption text-text-secondary">OR</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <form action={action} className="flex flex-col gap-4">
        {state?.error && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-sm font-medium text-text-primary">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-text-secondary focus:border-information focus:outline-none focus:ring-2 focus:ring-information/20"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium text-text-primary">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-text-secondary focus:border-information focus:outline-none focus:ring-2 focus:ring-information/20"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-medium text-text-primary">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-text-secondary focus:border-information focus:outline-none focus:ring-2 focus:ring-information/20"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-information px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {isPending ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="text-center text-body text-text-secondary">
        <p>
          Already have an account?{' '}
          <Link href="/login" className="text-information hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
