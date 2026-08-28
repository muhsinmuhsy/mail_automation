'use client';

interface Email {
  id: string;
  subject: string;
  to_email: string;
  status: string;
  body: string;
}

export function EmailDetail({ email }: { email: Email }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">{email.subject}</h3>
        <p className="text-sm text-text-secondary">To: {email.to_email}</p>
      </div>
      <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
        <p className="text-sm text-text-primary whitespace-pre-wrap">{email.body}</p>
      </div>
    </div>
  );
}
