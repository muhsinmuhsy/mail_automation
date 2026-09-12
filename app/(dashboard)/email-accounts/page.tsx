'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProviderConnectionDialog } from '@/components/email-accounts/ProviderConnectionDialog';
import { EmailAccountList } from '@/components/email-accounts/EmailAccountList';
import { EmailAccountEditDialog } from '@/components/email-accounts/EmailAccountEditDialog';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ProviderSelector } from '@/components/email-accounts/ProviderSelector';

interface EmailAccount {
  id: string;
  provider: string;
  email: string;
  is_active: boolean;
  auth_method?: string;
  connection_error?: string | null;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message: string };
  message?: string;
}

export default function EmailAccountsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [reactivateId, setReactivateId] = useState<string | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmailAccount | null>(null);
  const [editing, setEditing] = useState(false);
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
    const params = new URLSearchParams(window.location.search);
    const connection = params.get('connection');
    if (connection) {
      const messages: Record<string, string> = {
        connected: 'Gmail connected successfully.', cancelled: 'Google connection cancelled. No account was changed.',
        account_mismatch: 'Choose the same Google account when reconnecting.', failed: 'Could not connect Gmail. Please try again and allow sending access.',
      };
      setToast({ message: messages[connection] ?? messages.failed, type: connection === 'connected' ? 'success' : 'error' });
      window.history.replaceState({}, '', '/email-accounts');
    }
  }, [fetchAccounts]);

  const connectGoogle = async (accountId?: string) => {
    const response = await fetch('/api/email-accounts/connect/gmail', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId }),
    });
    const result = await response.json() as ApiResponse<{ url: string }>;
    if (!response.ok || !result.data?.url) throw new Error(result.error?.message || 'Could not start Google connection.');
    window.location.assign(result.data.url);
  };

  const reconnect = async (accountId: string) => {
    try { await connectGoogle(accountId); }
    catch (error) { setToast({ message: error instanceof Error ? error.message : 'Connection failed.', type: 'error' }); }
  };

  const disconnect = async () => {
    if (!disconnectId) return;
    setDisconnecting(true);
    try {
      const response = await fetch(`/api/email-accounts/${disconnectId}/disconnect`, { method: 'POST' });
      const result = await response.json() as ApiResponse<{ revoked: boolean }>;
      if (!result.success) throw new Error(result.error?.message || 'Could not disconnect account.');
      setToast({ message: result.message || 'Account disconnected.', type: result.data?.revoked ? 'success' : 'error' });
      await fetchAccounts();
    } catch (error) { setToast({ message: error instanceof Error ? error.message : 'Could not disconnect account.', type: 'error' }); }
    finally { setDisconnecting(false); setDisconnectId(null); }
  };

  // App password disabled — commented out for future re-enablement
  // const handleConnect = async (email: string, secret: string) => {
  //   const res = await fetch('/api/email-accounts', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ provider: 'gmail', email, auth_method: 'app_password', secret }),
  //   });
  //   const data = (await res.json()) as ApiResponse<EmailAccount>;
  //   if (data.success) {
  //     setDialogOpen(false);
  //     setToast({ message: 'Email account connected successfully.', type: 'success' });
  //     fetchAccounts();
  //   } else {
  //     throw new Error(data.error?.message || 'Failed to connect account.');
  //   }
  // };

  const handleTest = async (id: string) => {
    try {
    const res = await fetch(`/api/email-accounts/${id}/test`, { method: 'POST' });
    const data = (await res.json()) as ApiResponse<{ connected: boolean; message: string }>;
    if (data.success) {
      setToast({ message: data.data?.message || 'Connection test completed.', type: data.data?.connected ? 'success' : 'error' });
    } else {
      setToast({ message: data.error?.message || 'Connection test failed.', type: 'error' });
    }
    await fetchAccounts();
    } catch { setToast({ message: 'Could not verify the connection. Please try again.', type: 'error' }); }
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

  const openReactivateConfirm = (id: string) => {
    setReactivateId(id);
    setReactivateOpen(true);
  };

  const confirmReactivate = async () => {
    if (!reactivateId) return;
    setReactivating(true);
    try {
      const res = await fetch(`/api/email-accounts/${reactivateId}/reactivate`, { method: 'POST' });
      const data = (await res.json()) as ApiResponse<null>;
      if (data.success) {
        setToast({ message: 'Email account reactivated.', type: 'success' });
        fetchAccounts();
      } else {
        setToast({ message: data.error?.message || 'Failed to reactivate account.', type: 'error' });
      }
    } finally {
      setReactivating(false);
      setReactivateOpen(false);
    }
  };

  // App password disabled — commented out for future re-enablement
  // const openEdit = (account: EmailAccount) => {
  //   setEditTarget(account);
  //   setEditOpen(true);
  // };

  // const handleEditSecret = async (secret: string) => {
  //   if (!editTarget) return;
  //   setEditing(true);
  //   try {
  //     const res = await fetch(`/api/email-accounts/${editTarget.id}`, {
  //       method: 'PATCH',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ secret }),
  //     });
  //     const data = (await res.json()) as ApiResponse<null>;
  //     if (data.success) {
  //       setToast({ message: 'App password updated.', type: 'success' });
  //       setEditOpen(false);
  //     } else {
  //       setToast({ message: data.error?.message || 'Failed to update app password.', type: 'error' });
  //     }
  //   } finally {
  //     setEditing(false);
  //   }
  // };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold">Email Accounts</h1>
        <p className="mt-2 text-text-secondary">Manage your email sending accounts.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <h2 className="text-lg font-semibold text-text-primary">Connect your email</h2>
          <p className="text-sm text-text-secondary mt-1">
            Connect Gmail securely with Google. More providers are coming soon.
          </p>
          <div className="mt-4">
            <ProviderSelector selected="gmail" onSelect={() => setDialogOpen(true)} />
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>Connect Gmail</Button>
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
            <EmailAccountList
              accounts={accounts}
              onTest={handleTest}
              onDeactivate={openDeactivateConfirm}
              onReactivate={openReactivateConfirm}
              onReconnect={(id) => void reconnect(id)}
              onDisconnect={(id) => setDisconnectId(id)}
            />
          )}
        </div>
      </div>

      <ProviderConnectionDialog
        key={dialogOpen ? 'open' : 'closed'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        provider="Gmail"
        /* App password disabled — onConnect={handleConnect} */
        onOAuthConnect={() => connectGoogle()}
      />

      <ConfirmDialog open={!!disconnectId} onOpenChange={open => { if (!open) setDisconnectId(null); }} title="Disconnect Gmail"
        description="Remove stored authorization and stop future sends from this account. An email already being sent may still complete."
        confirmLabel="Disconnect" cancelLabel="Cancel" variant="destructive" loading={disconnecting} onConfirm={disconnect} />

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

      <ConfirmDialog
        open={reactivateOpen}
        onOpenChange={setReactivateOpen}
        title="Reactivate email account"
        description="Are you sure you want to reactivate this email account? It will resume sending emails."
        confirmLabel="Reactivate"
        cancelLabel="Cancel"
        variant="primary"
        loading={reactivating}
        onConfirm={confirmReactivate}
      />

      {/* App password disabled — commented out for future re-enablement
      <EmailAccountEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        email={editTarget?.email ?? ''}
        onSave={handleEditSecret}
        loading={editing}
      />
      */}

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
