'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { forgotPassword } from './actions';

export default function ForgotPasswordPage() {
  const [state, action, isPending] = useActionState(forgotPassword, null);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h1 className="text-page-title font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-2 text-body text-text-secondary">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>

      <form action={action} className="flex flex-col gap-4">
        {(state?.success) && (
          <p className="text-sm text-success-text">Check your email for a reset link.</p>
        )}
        {(state?.error && !state?.success) && (
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

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-information px-4 py-2 text-sm font-medium text-white hover:bg-information/90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {isPending ? 'Sending...' : 'Send reset link'}
        </button>
      </form>

      <div className="text-center text-body text-text-secondary">
        <p>
          Remember your password?{' '}
          <Link href="/login" className="text-information hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
