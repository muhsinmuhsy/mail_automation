'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface EmailAccountEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onSave: (secret: string) => void;
  loading?: boolean;
}

export function EmailAccountEditDialog({
  open,
  onOpenChange,
  email,
  onSave,
  loading = false,
}: EmailAccountEditDialogProps) {
  const [secret, setSecret] = useState('');

  const handleOpenChange = (next: boolean) => {
    if (!next) setSecret('');
    onOpenChange(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret.trim()) return;
    onSave(secret);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Edit App Password"
      description={`Update the app password for ${email}. Only the app password can be changed here.`}
    >
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <Input
          label="App Password"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          required
          placeholder="xxxx xxxx xxxx xxxx"
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} disabled={loading || !secret.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
