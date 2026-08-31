'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'PROCESSING', label: 'Sending' },
  { value: 'RETRY_WAIT', label: 'Waiting to retry' },
  { value: 'SENT', label: 'Sent' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'DELIVERY_UNKNOWN', label: 'Delivery status unknown' },
];

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type Envelope<T> =
  | { success: true; data: T; message?: string; pagination?: PaginationMeta }
  | { success: false; error: { type?: string; message: string } };

interface EmailRow {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  sent_at: string | null;
  created_at: string;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function EmailsPage() {
  const router = useRouter();
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (search.trim()) params.set('search', search.trim());

      try {
        const response = await fetch(`/api/emails?${params.toString()}`, {
          credentials: 'include',
          signal,
        });
        const body = (await response.json()) as Envelope<EmailRow[]>;

        if (response.status === 401) {
          router.replace('/login');
          return;
        }
        if (body.success) {
          setEmails(body.data);
          setMeta(body.pagination ?? null);
          setError(null);
        } else {
          setEmails([]);
          setError(body.error.message);
        }
      } catch {
        if (signal?.aborted) return;
        setEmails([]);
        setError('Failed to load emails.');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, router, search, status]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const retry = () => {
    setLoading(true);
    setError(null);
    void load();
  };

  const filtered = Boolean(status || search.trim());

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-page-title font-semibold tracking-tight">Emails</h1>
        <p className="mt-2 text-body text-text-secondary">View your email sending history.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:max-w-sm sm:flex-1">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search by recipient"
          />
        </div>
        <div className="sm:w-64">
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="py-12">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <ErrorState title="Could not load emails" message={error} onRetry={retry} />
      ) : emails.length === 0 ? (
        <EmptyState
          title={filtered ? 'No emails match these filters' : 'No emails sent yet'}
          description={
            filtered
              ? 'Try a different status or recipient.'
              : 'Emails will appear here once you start a campaign.'
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
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
                render: (email) => <StatusBadge status={email.status} />,
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

          {meta && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-supporting text-text-secondary">
                {meta.total} {meta.total === 1 ? 'email' : 'emails'}
              </p>
              {meta.totalPages > 1 && (
                <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
