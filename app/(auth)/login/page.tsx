'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { signInWithEmail } from './actions';
import GoogleSignInButton from '@/components/ui/GoogleSignInButton';

export default function LoginPage() {
  const [state, action, isPending] = useActionState(signInWithEmail, null);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-page-title font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-body text-text-secondary">
          Sign in to your account
        </p>
      </div>

      <GoogleSignInButton />

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-neutral-200" />
        <span className="text-caption text-text-secondary">OR</span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <form action={action} className="flex flex-col gap-4">
        {state?.error && (
          <p className="text-sm text-error">{state.error}</p>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium text-text-primary">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="flex h-10 w-full rounded-[var(--radius-md)] border border-neutral-200 bg-background px-3 py-2 text-sm placeholder:text-text-secondary focus:border-information focus:outline-none focus:ring-2 focus:ring-information/20"
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
            className="flex h-10 w-full rounded-[var(--radius-md)] border border-neutral-200 bg-background px-3 py-2 text-sm placeholder:text-text-secondary focus:border-information focus:outline-none focus:ring-2 focus:ring-information/20"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-information px-4 py-2 text-sm font-medium text-white hover:bg-information/90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {isPending ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div className="text-center text-body text-text-secondary">
        <p>
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-information hover:underline">
            Sign up
          </Link>
        </p>
        <p className="mt-1">
          <Link href="/forgot-password" className="text-information hover:underline">
            Forgot password?
          </Link>
        </p>
      </div>
    </div>
  );
}
