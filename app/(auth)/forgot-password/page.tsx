'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { forgotPassword } from './actions';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { Input } from '@/components/ui/Input';

export default function ForgotPasswordPage() {
  const [state, action, isPending] = useActionState(forgotPassword, null);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <div className="mx-auto mb-8 flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] border border-neutral-200 bg-surface text-sm font-semibold text-text-primary shadow-subtle">
          MA
        </div>
        <h1 className="text-page-title font-semibold">Reset your password</h1>
        <p className="mt-2 text-body text-text-secondary">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>

      <form action={action} className="flex flex-col gap-4">
        {(state?.success) && (
          <FormMessage type="success" message="Check your email for a reset link." />
        )}
        {(state?.error && !state?.success) && (
          <FormMessage type="error" message={state.error} />
        )}
        <Input id="email" name="email" type="email" label="Email" autoComplete="email" required />

        <Button
          type="submit"
          loading={isPending}
          className="w-full"
        >
          Send reset link
        </Button>
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
