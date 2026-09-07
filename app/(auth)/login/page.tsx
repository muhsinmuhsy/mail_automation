'use client';
// import Link from 'next/link';
// import { useActionState } from 'react';
// import { signInWithEmail } from './actions';
import GoogleSignInButton from '@/components/ui/GoogleSignInButton';
// import { Button } from '@/components/ui/Button';
// import { FormMessage } from '@/components/ui/FormMessage';
// import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  // const [state, action, isPending] = useActionState(signInWithEmail, null);

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <div className="mx-auto mb-8 flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] border border-neutral-200 bg-surface text-sm font-semibold text-text-primary shadow-subtle">
          MA
        </div>
        <h1 className="text-page-title font-semibold">Welcome back</h1>
        <p className="mt-2 text-body text-text-secondary">
          Sign in to your account
        </p>
      </div>

      <GoogleSignInButton />

      {/* <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-neutral-200" />
        <span className="text-caption text-text-secondary">OR</span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <form action={action} className="flex flex-col gap-4">
        {state?.error && (
          <FormMessage type="error" message={state.error} />
        )}
        <Input id="email" name="email" type="email" label="Email" autoComplete="email" required />

        <Input id="password" name="password" type="password" label="Password" autoComplete="current-password" required />

        <Button
          type="submit"
          loading={isPending}
          className="w-full"
        >
          Sign in
        </Button>
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
      </div> */}
    </div>
  );
}
