'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProviderConnectionDialog } from '@/components/email-accounts/ProviderConnectionDialog';
import { EmailAccountCard } from '@/components/email-accounts/EmailAccountCard';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface EmailAccount {
  id: string;
  provider: string;
  email: string;
  is_active: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message: string };
}

export default function EmailAccountsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/email-accounts');
      const data = (await res.json()) as ApiResponse<EmailAccount[]>;
      if (data.success && data.data) {
        setAccounts(data.data);
      } else {
        setError(data.error?.message || 'Failed to load accounts.');
      }
    } catch {
      setError('Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAccounts();
  }, [fetchAccounts]);

  const handleConnect = async (email: string, secret: string) => {
    const res = await fetch('/api/email-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'gmail', email, auth_method: 'app_password', secret }),
    });
    const data = (await res.json()) as ApiResponse<EmailAccount>;
    if (data.success) {
      setDialogOpen(false);
      setToast({ message: 'Email account connected successfully.', type: 'success' });
      fetchAccounts();
    } else {
      setToast({ message: data.error?.message || 'Failed to connect account.', type: 'error' });
    }
  };

  const handleTest = async (id: string) => {
    const res = await fetch(`/api/email-accounts/${id}/test`, { method: 'POST' });
    const data = (await res.json()) as ApiResponse<{ connected: boolean; message: string }>;
    if (data.success) {
      setToast({ message: data.data?.message || 'Connection test completed.', type: 'success' });
    } else {
      setToast({ message: data.error?.message || 'Connection test failed.', type: 'error' });
    }
  };

  const openDeactivateConfirm = (id: string) => {
    setDeactivateId(id);
    setConfirmOpen(true);
  };

  const confirmDeactivate = async () => {
    if (!deactivateId) return;
    setDeactivating(true);
    try {
      const res = await fetch(`/api/email-accounts/${deactivateId}`, { method: 'DELETE' });
      const data = (await res.json()) as ApiResponse<null>;
      if (data.success) {
        setToast({ message: 'Email account deactivated.', type: 'success' });
        fetchAccounts();
      } else {
        setToast({ message: data.error?.message || 'Failed to deactivate account.', type: 'error' });
      }
    } finally {
      setDeactivating(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Email Accounts</h1>
        <p className="mt-2 text-text-secondary">Manage your email sending accounts.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <h2 className="text-lg font-semibold text-text-primary">Connect Gmail account</h2>
          <p className="text-sm text-text-secondary mt-1">
            Use a Gmail App Password to send emails through your account.
          </p>
          <div className="mt-4">
            <Button onClick={() => setDialogOpen(true)}>Connect Gmail</Button>
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background">
          <div className="p-4">
            <h3 className="font-medium text-text-primary">Connected accounts</h3>
          </div>
          {loading ? (
            <div className="p-8 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <div className="p-4 text-center text-sm text-error">{error}</div>
          ) : accounts.length === 0 ? (
            <div className="p-4 text-center text-sm text-text-secondary">
              No email accounts connected yet.
            </div>
          ) : (
            <div className="divide-y divide-neutral-200">
              {accounts.map((account) => (
                <EmailAccountCard
                  key={account.id}
                  account={account}
                  onTest={() => handleTest(account.id)}
                  onDeactivate={() => openDeactivateConfirm(account.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ProviderConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        provider="Gmail"
        onConnect={handleConnect}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Deactivate email account"
        description="Are you sure you want to deactivate this email account? It will stop sending emails until reactivated."
        confirmLabel="Deactivate"
        cancelLabel="Cancel"
        variant="destructive"
        loading={deactivating}
        onConfirm={confirmDeactivate}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
