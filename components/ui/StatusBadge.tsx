'use client';

import { Badge } from './Badge';

const statusStyles: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'information' }> = {
  SCHEDULED: { label: 'Scheduled', variant: 'information' },
  QUEUED: { label: 'Queued', variant: 'information' },
  PROCESSING: { label: 'Sending', variant: 'warning' },
  RETRY_WAIT: { label: 'Waiting to retry', variant: 'warning' },
  SENT: { label: 'Sent', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'error' },
  CANCELLED: { label: 'Cancelled', variant: 'default' },
  DELIVERY_UNKNOWN: { label: 'Delivery status unknown', variant: 'warning' },
  DRAFT: { label: 'Draft', variant: 'default' },
  ACTIVE: { label: 'Active', variant: 'success' },
  PAUSED: { label: 'Paused', variant: 'warning' },
  COMPLETED: { label: 'Completed', variant: 'success' },
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusStyles[status] || { label: status, variant: 'default' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
