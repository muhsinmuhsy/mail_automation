'use client';
import { sendVerificationEmail } from './actions';

export default function VerifyEmailPage() {
  return (
    <div className="flex flex-col gap-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Verify your email</h1>
      <p className="text-sm text-text-secondary">
        We&apos;ve sent a verification link to your email address. Please check your inbox and click the link to verify your account.
      </p>

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <form action={sendVerificationEmail as any} className="flex flex-col gap-3">
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-information px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          Resend verification email
        </button>
      </form>
    </div>
  );
}
