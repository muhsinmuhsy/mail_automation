'use client';

interface Email {
  id: string;
  subject: string;
  to_email: string;
  status: string;
}

export function EmailList({ emails }: { emails: Email[] }) {
  return (
    <div className="flex flex-col gap-4">
      {emails.map((email) => (
        <div key={email.id} className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-text-primary">{email.subject}</p>
            <p className="text-sm text-text-secondary">{email.to_email}</p>
          </div>
          <span className="text-xs font-medium text-text-secondary">{email.status}</span>
        </div>
      ))}
    </div>
  );
}
