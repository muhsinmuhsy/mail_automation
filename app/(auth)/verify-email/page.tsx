'use client';
import { useActionState } from 'react';
import { useTransition } from 'react';
import { verifyOtp, sendVerificationEmail } from './actions';
import { Button } from '@/components/ui/Button';
import { FormMessage } from '@/components/ui/FormMessage';
import { Input } from '@/components/ui/Input';

export default function VerifyEmailPage() {
  const [otpState, otpAction, otpPending] = useActionState(verifyOtp, null);
  const [resendPending, startResend] = useTransition();

  const handleResend = () => {
    startResend(async () => {
      await sendVerificationEmail();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <div className="mx-auto mb-8 flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] border border-neutral-200 bg-surface text-sm font-semibold text-text-primary shadow-subtle">
          MA
        </div>
        <h1 className="text-page-title font-semibold">Verify your email</h1>
        <p className="mt-2 text-body text-text-secondary">
          Enter the verification code we sent to your email address.
        </p>
      </div>

      <form action={otpAction} className="flex flex-col gap-4">
        {otpState?.error && (
          <FormMessage type="error" message={otpState.error} />
        )}
        <Input
          id="token"
          name="token"
          type="text"
          label="Verification code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={10}
          required
          autoComplete="one-time-code"
          className="text-center"
        />
        <Button
          type="submit"
          loading={otpPending}
          className="w-full"
        >
          Verify email
        </Button>
      </form>

      <Button
        type="button"
        variant="secondary"
        onClick={handleResend}
        loading={resendPending}
        className="w-full"
      >
        Resend verification email
      </Button>
    </div>
  );
}
