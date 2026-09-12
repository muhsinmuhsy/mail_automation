'use client';

import { formatScheduledTime } from '@/lib/scheduling/time';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';

export interface EmailRow {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  scheduled_at: string;
  next_attempt_at: string | null;
  error_message: string | null;
  campaign: { timezone: string; name: string } | null;
  sent_at: string | null;
  created_at: string;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function EmailList({ emails }: { emails: EmailRow[] }) {
  return (
    <DataTable
      data={emails}
      columns={[
        {
          key: 'to_email',
          header: 'To',
          render: (email) => <span className="text-text-primary">{email.to_email}</span>,
        },
        {
          key: 'subject',
          header: 'Subject',
          render: (email) => <span className="text-text-primary">{email.subject}</span>,
        },
        {
          key: 'status',
          header: 'Status',
          render: (email) => <div><StatusBadge status={email.status} />{email.error_message && <p className="mt-1 text-caption text-text-secondary">{email.error_message}</p>}{email.next_attempt_at && email.status === 'RETRY_WAIT' && <p className="text-caption">Retry: {formatScheduledTime(email.next_attempt_at, email.campaign?.timezone)}</p>}</div>,
        },
        {
          key: 'scheduled_at',
          header: 'Scheduled for',
          render: (email) => <span>{formatScheduledTime(email.scheduled_at, email.campaign?.timezone)}</span>,
        },
        {
          key: 'created_at',
          header: 'Created',
          render: (email) => (
            <span className="text-text-secondary">{formatDateTime(email.created_at)}</span>
          ),
        },
        {
          key: 'sent_at',
          header: 'Sent',
          render: (email) => (
            <span className="text-text-secondary">{formatDateTime(email.sent_at)}</span>
          ),
        },
      ]}
    />
  );
}
