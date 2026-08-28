'use client';

interface EmailAccount {
  id: string;
  provider: string;
  email: string;
  is_active: boolean;
}

export function EmailAccountCard({ account }: { account: EmailAccount }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
      <p className="font-medium text-text-primary">{account.email}</p>
      <p className="text-sm text-text-secondary">{account.provider}</p>
    </div>
  );
}
