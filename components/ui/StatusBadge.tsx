'use client';

import { Badge } from './Badge';

const statusStyles: Record<string, { label: string; marker: string; variant: 'default' | 'success' | 'warning' | 'error' | 'information' }> = {
  SCHEDULED: { label: 'Scheduled', marker: 'S', variant: 'information' },
  QUEUED: { label: 'Queued', marker: 'Q', variant: 'information' },
  PROCESSING: { label: 'Sending', marker: 'P', variant: 'warning' },
  RETRY_WAIT: { label: 'Waiting to retry', marker: 'R', variant: 'warning' },
  SENT: { label: 'Sent', marker: 'OK', variant: 'success' },
  FAILED: { label: 'Failed', marker: '!', variant: 'error' },
  CANCELLED: { label: 'Cancelled', marker: 'X', variant: 'default' },
  DELIVERY_UNKNOWN: { label: 'Delivery status unknown', marker: '?', variant: 'warning' },
  DRAFT: { label: 'Draft', marker: 'D', variant: 'default' },
  ACTIVE: { label: 'Active', marker: 'A', variant: 'success' },
  PAUSED: { label: 'Paused', marker: 'P', variant: 'warning' },
  COMPLETED: { label: 'Completed', marker: 'OK', variant: 'success' },
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusStyles[status] || { label: status, marker: '-', variant: 'default' as const };
  return (
    <Badge variant={config.variant}>
      <span aria-hidden="true" className="mr-1 font-semibold">{config.marker}</span>
      {config.label}
    </Badge>
  );
}
