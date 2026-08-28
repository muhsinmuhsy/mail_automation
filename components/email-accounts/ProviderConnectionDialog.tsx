'use client';

import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

interface ProviderConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: string;
  onConnect: () => void;
}

export function ProviderConnectionDialog({ open, onOpenChange, provider, onConnect }: ProviderConnectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Connect ${provider}`}>
      <p className="text-sm text-text-secondary">
        Follow the instructions to connect your {provider} account.
      </p>
      <div className="flex justify-end gap-3 mt-4">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={onConnect}>Connect</Button>
      </div>
    </Dialog>
  );
}
