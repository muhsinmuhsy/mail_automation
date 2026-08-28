'use client';

import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface ProviderConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: string;
  onConnect: (email: string, secret: string) => void;
}

export function ProviderConnectionDialog({ open, onOpenChange, provider, onConnect }: ProviderConnectionDialogProps) {
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onConnect(email, secret);
      setEmail('');
      setSecret('');
    } catch {
      setError('Failed to connect account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Connect ${provider}`}>
      <p className="text-sm text-text-secondary">
        Enter your Gmail address and App Password to send emails.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        {error && <p className="text-sm text-error">{error}</p>}
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@gmail.com"
        />
        <Input
          label="App Password"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          required
          placeholder="xxxx xxxx xxxx xxxx"
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Connect
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
