'use client';

import { ProviderSelector } from '@/components/email-accounts/ProviderSelector';
import { ProviderConnectionDialog } from '@/components/email-accounts/ProviderConnectionDialog';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export default function EmailAccountsPage() {
  const [selectedProvider, setSelectedProvider] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Email Accounts</h1>
        <p className="mt-2 text-text-secondary">Manage your email sending accounts.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <h2 className="text-lg font-semibold text-text-primary">Connect email account</h2>
          <ProviderSelector selected={selectedProvider} onSelect={setSelectedProvider} />
          <div className="mt-4">
            <Button onClick={() => setDialogOpen(true)} disabled={!selectedProvider}>
              Continue
            </Button>
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background">
          <div className="p-4">
            <h3 className="font-medium text-text-primary">Connected accounts</h3>
          </div>
          <div className="p-4 text-center text-sm text-text-secondary">
            No email accounts connected yet.
          </div>
        </div>
      </div>

      <ProviderConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        provider={selectedProvider}
        onConnect={() => {}}
      />
    </div>
  );
}
