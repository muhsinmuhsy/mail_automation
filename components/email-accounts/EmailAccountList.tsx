'use client';

interface EmailAccount {
  id: string;
  provider: string;
  email: string;
  is_active: boolean;
}

export function EmailAccountList({ accounts }: { accounts: EmailAccount[] }) {
  return (
    <div className="flex flex-col gap-4">
      {accounts.map((account) => (
        <div key={account.id} className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
          <p className="font-medium text-text-primary">{account.email}</p>
          <p className="text-sm text-text-secondary">{account.provider}</p>
        </div>
      ))}
    </div>
  );
}
