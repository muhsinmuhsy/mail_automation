'use client';

import { STATUS_CONFIG, type StatusCount } from '@/lib/campaigns/status-counts';

interface CampaignProgressBarProps {
  counts: StatusCount[];
  total: number;
  variant?: 'compact' | 'detail';
}

const SEGMENT_COLORS: Record<string, string> = {
  SENT: 'bg-success',
  FAILED: 'bg-error',
  SCHEDULED: 'bg-information',
  QUEUED: 'bg-information',
  PROCESSING: 'bg-warning',
  RETRY_WAIT: 'bg-warning',
  CANCELLED: 'bg-neutral-300',
  DELIVERY_UNKNOWN: 'bg-neutral-400',
};

export function CampaignProgressBar({ counts, total, variant = 'compact' }: CampaignProgressBarProps) {
  if (total === 0) return null;

  const configMap = new Map(STATUS_CONFIG.map(c => [c.status, c]));
  const segments = counts
    .filter(c => c.count > 0)
    .map(c => ({
      status: c.status,
      count: c.count,
      percentage: (c.count / total) * 100,
      color: SEGMENT_COLORS[c.status] ?? 'bg-neutral-300',
      label: configMap.get(c.status)?.label ?? c.status,
    }));

  if (segments.length === 0) return null;

  const sentCount = counts.find(c => c.status === 'SENT')?.count ?? 0;
  const failedCount = counts.find(c => c.status === 'FAILED')?.count ?? 0;
  const remaining = total - sentCount - failedCount;

  if (variant === 'detail') {
    return (
      <div>
        <div className="flex items-center justify-between">
          <p className="text-supporting text-text-secondary">Delivery progress</p>
          <p className="text-sm font-medium text-text-primary">
            {sentCount} sent{failedCount > 0 ? `, ${failedCount} failed` : ''}{remaining > 0 ? `, ${remaining} remaining` : ''}
          </p>
        </div>
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuenow={sentCount} aria-valuemin={0} aria-valuemax={total}>
          {segments.map(seg => (
            <div
              key={seg.status}
              className={seg.color}
              style={{ width: `${seg.percentage}%` }}
              title={`${seg.label}: ${seg.count}`}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {segments.map(seg => (
            <span key={seg.status} className="inline-flex items-center gap-1.5 text-caption text-text-secondary">
              <span className={`inline-block h-2 w-2 rounded-full ${seg.color}`} />
              {seg.label} {seg.count}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuenow={sentCount} aria-valuemin={0} aria-valuemax={total}>
        {segments.map(seg => (
          <div
            key={seg.status}
            className={seg.color}
            style={{ width: `${seg.percentage}%` }}
            title={`${seg.label}: ${seg.count}`}
          />
        ))}
      </div>
      <p className="mt-1 text-caption text-text-secondary">
        {sentCount}/{total} sent{failedCount > 0 ? ` \u00b7 ${failedCount} failed` : ''}{remaining > 0 ? ` \u00b7 ${remaining} remaining` : ''}
      </p>
    </div>
  );
}
