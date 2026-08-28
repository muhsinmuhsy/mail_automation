'use client';

interface Email {
  id: string;
  subject: string;
  to_email: string;
  status: string;
}

export function EmailCard({ email }: { email: Email }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
      <p className="font-medium text-text-primary">{email.subject}</p>
      <p className="text-sm text-text-secondary">{email.to_email}</p>
    </div>
  );
}
