'use client';

import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatusBadge } from '@/components/ui/StatusBadge';

export interface AdminEmailJobRow {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  user: { email: string };
}

interface AdminEmailTableProps {
  jobs?: AdminEmailJobRow[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function AdminEmailTable({
  jobs,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'No emails found',
  emptyDescription = 'Email jobs appear here once users start sending campaigns.',
}: AdminEmailTableProps) {
  if (loading) {
    return (
      <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background">
        <ErrorState title="Could not load emails" message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <DataTable
      data={jobs}
      columns={[
        {
          key: 'to_email',
          header: 'To',
          render: (job) => <span className="text-text-primary">{job.to_email}</span>,
        },
        {
          key: 'subject',
          header: 'Subject',
          render: (job) => <span className="text-text-primary">{job.subject}</span>,
        },
        {
          key: 'status',
          header: 'Status',
          render: (job) => (
            <div className="flex flex-col gap-1">
              <StatusBadge status={job.status} />
              {job.error_message ? (
                <span className="text-caption text-text-secondary">{job.error_message}</span>
              ) : null}
            </div>
          ),
        },
        {
          key: 'user',
          header: 'User',
          render: (job) => <span className="text-text-primary">{job.user.email}</span>,
        },
        {
          key: 'created_at',
          header: 'Created',
          render: (job) => <span className="text-text-secondary">{formatDateTime(job.created_at)}</span>,
        },
        {
          key: 'sent_at',
          header: 'Sent',
          render: (job) => <span className="text-text-secondary">{formatDateTime(job.sent_at)}</span>,
        },
      ]}
    />
  );
}
