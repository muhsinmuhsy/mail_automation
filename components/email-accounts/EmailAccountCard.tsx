'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface EmailAccount {
  id: string;
  provider: string;
  email: string;
  is_active: boolean;
}

interface EmailAccountCardProps {
  account: EmailAccount;
  onTest: () => void;
  onDeactivate: () => void;
}

export function EmailAccountCard({ account, onTest, onDeactivate }: EmailAccountCardProps) {
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    await onTest();
    setTesting(false);
  };

  return (
    <div className="p-4 flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium text-text-primary">{account.email}</p>
          <StatusBadge status={account.is_active ? 'ACTIVE' : 'CANCELLED'} />
        </div>
        <p className="text-sm text-text-secondary capitalize">{account.provider}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={handleTest} disabled={testing || !account.is_active}>
          {testing ? 'Testing...' : 'Test'}
        </Button>
        {account.is_active && (
          <Button variant="destructive" size="sm" onClick={onDeactivate}>
            Deactivate
          </Button>
        )}
      </div>
    </div>
  );
}
