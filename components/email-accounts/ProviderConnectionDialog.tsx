'use client';
import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface ProviderConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: string;
  onConnect: (email: string, secret: string) => void | Promise<void>;
  onOAuthConnect?: () => void | Promise<void>;
}

export function ProviderConnectionDialog({ open, onOpenChange, provider, onConnect, onOAuthConnect }: ProviderConnectionDialogProps) {
  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const run = async (action: () => void | Promise<void>) => {
    setLoading(true); setError(null);
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Failed to connect account. Please try again.'); }
    finally { setLoading(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Connect ${provider}`}>
      {provider.toLowerCase() !== 'gmail' ? <p>This provider is coming soon.</p> : <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">Send emails from your Gmail account. Google will ask you to allow sending on your behalf.</p>
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        <Button disabled={!onOAuthConnect} loading={loading} onClick={() => onOAuthConnect && run(onOAuthConnect)}>Continue with Google</Button>
        <p className="text-sm text-text-secondary">You never give us your Google password.</p>
        <button type="button" className="text-left text-sm underline text-text-secondary" onClick={() => setFallback(!fallback)} aria-expanded={fallback}>Advanced: use an App Password instead</button>
        {fallback && <form onSubmit={(event) => {
          event.preventDefault();
          void run(async () => { await onConnect(email, secret); setEmail(''); setSecret(''); });
        }} className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">Optional SMTP fallback. Use a Google App Password, never your normal Google password.</p>
          <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
          <Input label="App Password" type="password" value={secret} onChange={e => setSecret(e.target.value)} required autoComplete="off" />
          <Button type="submit" loading={loading}>Connect with App Password</Button>
        </form>}
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
      </div>}
    </Dialog>
  );
}
