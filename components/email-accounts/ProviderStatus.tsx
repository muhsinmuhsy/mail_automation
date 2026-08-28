'use client';

import { StatusBadge } from '@/components/ui/StatusBadge';

interface ProviderStatusProps {
  connected: boolean;
  lastChecked?: string;
}

export function ProviderStatus({ connected, lastChecked }: ProviderStatusProps) {
  return (
    <div className="flex items-center gap-3">
      <StatusBadge status={connected ? 'ACTIVE' : 'FAILED'} />
      {lastChecked && (
        <span className="text-sm text-text-secondary">
          Last checked: {new Date(lastChecked).toLocaleString()}
        </span>
      )}
    </div>
  );
}
