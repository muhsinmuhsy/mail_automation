'use client';

import { STATUS_CONFIG, type StatusCount } from '@/lib/campaigns/status-counts';

interface EmailStatusBreakdownProps {
  counts: StatusCount[];
  variant?: 'compact' | 'detail';
}

export function EmailStatusBreakdown({ counts, variant = 'compact' }: EmailStatusBreakdownProps) {
  if (counts.length === 0) return null;

  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const configMap = new Map(STATUS_CONFIG.map(c => [c.status, c]));

  if (variant === 'detail') {
    return (
      <div className="flex flex-wrap gap-4">
        {counts.map(({ status, count }) => {
          const config = configMap.get(status);
          if (!config || count === 0) return null;
          return (
            <div key={status} className="flex items-center gap-1.5">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${config.dotClass}`} />
              <span className="text-sm text-text-secondary">{config.label}</span>
              <span className="text-sm font-medium text-text-primary">{count}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-text-secondary">Total</span>
          <span className="text-sm font-medium text-text-primary">{total}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {counts.map(({ status, count }) => {
        const config = configMap.get(status);
        if (!config || count === 0) return null;
        return (
          <span key={status} className="inline-flex items-center gap-1 text-caption text-text-secondary">
            <span className={`inline-block h-2 w-2 rounded-full ${config.dotClass}`} />
            {config.label} {count}
          </span>
        );
      })}
    </div>
  );
}
