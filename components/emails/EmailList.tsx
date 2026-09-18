'use client';

import { formatScheduledTime } from '@/lib/scheduling/time';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { stripErrorCode } from '@/lib/limits/error-codes';

export interface EmailRow {
  id: string;
  to_email: string;
  subject?: string;
  status: string;
  scheduled_at: string;
  next_attempt_at: string | null;
  error_message: string | null;
  campaign?: { timezone: string; name: string } | null;
  sent_at: string | null;
  created_at?: string;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

interface EmailListProps {
  emails: EmailRow[];
  onRetry?: (email: EmailRow) => void;
  retryingId?: string | null;
  showSubject?: boolean;
  showCreated?: boolean;
  timezone?: string;
}

export function EmailList({
  emails,
  onRetry,
  retryingId = null,
  showSubject = true,
  showCreated = true,
  timezone,
}: EmailListProps) {
  const tz = (email: EmailRow) => email.campaign?.timezone ?? timezone;

  const columns = [
    {
      key: 'to_email',
      header: 'Recipient',
      render: (email: EmailRow) => <span className="text-text-primary">{email.to_email}</span>,
    },
    ...(showSubject
      ? [{
          key: 'subject',
          header: 'Subject',
          render: (email: EmailRow) => <span className="text-text-primary">{email.subject ?? '—'}</span>,
        }]
      : []),
    {
      key: 'status',
      header: 'Status',
      render: (email: EmailRow) => (
        <div>
          <StatusBadge status={email.status} />
          {email.error_message && email.status !== 'SENT' && (
            <p className="mt-1 text-caption text-text-secondary">{stripErrorCode(email.error_message)}</p>
          )}
          {email.next_attempt_at && email.status === 'RETRY_WAIT' && (
            <p className="text-caption">Retry: {formatScheduledTime(email.next_attempt_at, tz(email))}</p>
          )}
        </div>
      ),
    },
    {
      key: 'scheduled_at',
      header: 'Scheduled for',
      render: (email: EmailRow) => <span>{formatScheduledTime(email.scheduled_at, tz(email))}</span>,
    },
    ...(showCreated
      ? [{
          key: 'created_at',
          header: 'Created',
          render: (email: EmailRow) => (
            <span className="text-text-secondary">{formatDateTime(email.created_at)}</span>
          ),
        }]
      : []),
    {
      key: 'sent_at',
      header: 'Sent',
      render: (email: EmailRow) => (
        <span className="text-text-secondary">{formatScheduledTime(email.sent_at, tz(email))}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (email: EmailRow) =>
        (email.status === 'FAILED' || email.status === 'RETRY_WAIT') && onRetry ? (
          <Button
            variant="secondary"
            size="sm"
            loading={retryingId === email.id}
            disabled={retryingId !== null && retryingId !== email.id}
            onClick={() => onRetry(email)}
          >
            Retry
          </Button>
        ) : <span className="text-text-secondary">—</span>,
    },
  ];

  return <DataTable data={emails} columns={columns} />;
}
