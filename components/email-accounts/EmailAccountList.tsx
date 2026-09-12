'use client';

import { EmailAccountCard } from './EmailAccountCard';

interface EmailAccount {
  id: string;
  provider: string;
  email: string;
  is_active: boolean;
  auth_method?: string;
  connection_error?: string | null;
}

interface EmailAccountListProps {
  accounts: EmailAccount[];
  onTest: (id: string) => void;
  onDeactivate: (id: string) => void;
  onReactivate: (id: string) => void;
  onReconnect?: (id: string) => void;
  onDisconnect?: (id: string) => void;
}

export function EmailAccountList({ accounts, onTest, onDeactivate, onReactivate, onReconnect, onDisconnect }: EmailAccountListProps) {
  return (
    <div className="divide-y divide-neutral-200">
      {accounts.map((account) => (
        <EmailAccountCard
          key={account.id}
          account={account}
          onTest={() => onTest(account.id)}
          onDeactivate={() => onDeactivate(account.id)}
          onReactivate={() => onReactivate(account.id)}
          onReconnect={onReconnect ? () => onReconnect(account.id) : undefined}
          onDisconnect={onDisconnect ? () => onDisconnect(account.id) : undefined}
        />
      ))}
    </div>
  );
}
