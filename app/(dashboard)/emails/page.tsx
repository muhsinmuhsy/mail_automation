'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmailList, type EmailRow } from '@/components/emails/EmailList';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Pagination } from '@/components/ui/Pagination';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Toast } from '@/components/ui/Toast';

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

export default function EmailsPage() {
  const router = useRouter();
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') =>
    setToast({ id: Date.now(), message, type });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

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
    [page, router, search, status, startDate, endDate]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void load(controller.signal), 250);
    const refresh = setInterval(() => {
      if (document.visibilityState === 'visible') void load(controller.signal);
    }, 15_000);
    return () => {
      clearInterval(refresh);
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const retry = () => {
    setLoading(true);
    setError(null);
    void load();
  };

  const retryEmail = async (email: EmailRow) => {
    setRetryingId(email.id);
    try {
      const response = await fetch(`/api/emails/${email.id}/retry`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = await response.json() as Envelope<null>;

      if (response.status === 401) {
        router.replace('/login');
        return;
      }
      if (body.success) {
        showToast(body.message ?? 'Email queued for retry.', 'success');
        await load();
      } else {
        showToast(body.error.message, 'error');
      }
    } catch {
      showToast('Failed to retry email.', 'error');
    } finally {
      setRetryingId(null);
    }
  };

  const filtered = Boolean(status || search.trim());

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Emails" description="View your email sending history." />

      <ListToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        filters={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
            <DateRangeFilter
              startDate={startDate}
              endDate={endDate}
              onStartChange={(v) => { setStartDate(v); setPage(1); }}
              onEndChange={(v) => { setEndDate(v); setPage(1); }}
              onClear={() => { setStartDate(''); setEndDate(''); setPage(1); }}
            />
          </div>
        }
      />

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
          <EmailList emails={emails} onRetry={retryEmail} retryingId={retryingId} />

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

      {toast && (
        <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
