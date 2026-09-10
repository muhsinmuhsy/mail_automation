'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface EmailAccount {
  id: string;
  provider: string;
  email: string;
  is_active: boolean;
  auth_method?: string;
  connection_error?: string | null;
}

interface EmailAccountCardProps {
  account: EmailAccount;
  onTest: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
  onEdit?: () => void;
  onReconnect?: () => void;
  onDisconnect?: () => void;
}

export function EmailAccountCard({ account, onTest, onDeactivate, onReactivate, onEdit, onReconnect, onDisconnect }: EmailAccountCardProps) {
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try { await onTest(); } finally { setTesting(false); }
  };

  return (
    <div className="p-4 flex flex-wrap gap-3 items-center justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-text-primary break-all">{account.email}</p>
          <StatusBadge status={account.is_active ? 'ACTIVE' : 'CANCELLED'} />
        </div>
        <p className="text-sm text-text-secondary capitalize">{account.provider}</p>
        {account.auth_method === 'oauth2' && <p className="text-sm text-text-secondary">{account.connection_error === 'reconnect_required' ? 'Authorization expired. Reconnect to resume sending.' : account.is_active ? 'Connected with Google' : 'Disconnected'}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {account.auth_method !== 'oauth2' && account.provider === 'gmail' && onReconnect && <Button variant="secondary" size="sm" onClick={onReconnect}>Connect with Google</Button>}
        <Button variant="secondary" size="sm" onClick={handleTest} disabled={testing || !account.is_active}>
          {testing ? 'Testing...' : 'Test'}
        </Button>
        {account.auth_method === 'oauth2' ? <>
          <Button variant="secondary" size="sm" onClick={onReconnect}>Reconnect</Button>
          {account.is_active && <Button variant="destructive" size="sm" onClick={onDisconnect}>Disconnect</Button>}
        </> : /* App password disabled — commented out for future re-enablement
        account.is_active ? (
          <>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={onDeactivate}>
              Deactivate
            </Button>
          </>
        ) : (
          <Button variant="primary" size="sm" onClick={onReactivate}>
            Reactivate
          </Button>
        )
        */ null}
      </div>
    </div>
  );
}
