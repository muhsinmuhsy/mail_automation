'use client';
import { useActionState } from 'react';
import { useTransition } from 'react';
import { verifyOtp, sendVerificationEmail } from './actions';

export default function VerifyEmailPage() {
  const [otpState, otpAction, otpPending] = useActionState(verifyOtp, null);
  const [resendPending, startResend] = useTransition();

  const handleResend = () => {
    startResend(async () => {
      await sendVerificationEmail();
    });
  };

  return (
    <div className="flex flex-col gap-4 text-center">
      <h1 className="text-page-title font-semibold tracking-tight">Verify your email</h1>
      <p className="text-body text-text-secondary">
        Enter the verification code we sent to your email address.
      </p>

      <form action={otpAction} className="flex flex-col gap-3">
        {otpState?.error && (
          <p className="text-sm text-error">{otpState.error}</p>
        )}
        <input
          name="token"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={10}
          placeholder="7431888"
          required
          className="flex h-10 w-full rounded-[var(--radius-md)] border border-neutral-200 bg-background px-3 py-2 text-center text-sm tracking-widest placeholder:text-text-secondary focus:border-information focus:outline-none focus:ring-2 focus:ring-information/20"
        />
        <button
          type="submit"
          disabled={otpPending}
          className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-information px-4 py-2 text-sm font-medium text-white hover:bg-information/90 disabled:opacity-50"
        >
          {otpPending ? 'Verifying...' : 'Verify email'}
        </button>
      </form>

      <button
        onClick={handleResend}
        disabled={resendPending}
        className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border border-neutral-200 bg-background px-4 py-2 text-sm font-medium text-text-primary hover:bg-selected disabled:opacity-50"
      >
        {resendPending ? 'Sending...' : 'Resend verification email'}
      </button>
    </div>
  );
}
