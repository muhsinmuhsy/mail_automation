'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminEmailTable, type AdminEmailJobRow } from '@/components/admin/AdminEmailTable';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';

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

export default function AdminEmailsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<AdminEmailJobRow[]>([]);
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
        const response = await fetch(`/api/admin/emails?${params.toString()}`, {
          credentials: 'include',
          signal,
        });
        const body = (await response.json()) as Envelope<AdminEmailJobRow[]>;

        if (response.status === 401) {
          router.replace('/login');
          return;
        }
        if (body.success) {
          setJobs(body.data);
          setMeta(body.pagination ?? null);
          setError(null);
        } else {
          setJobs([]);
          setError(body.error.message);
        }
      } catch {
        if (signal?.aborted) return;
        setJobs([]);
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-semibold">Emails</h1>
        <p className="mt-2 text-body text-text-secondary">Email jobs across all users.</p>
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

      <AdminEmailTable
        jobs={jobs}
        loading={loading}
        error={error}
        onRetry={retry}
        emptyTitle={status || search.trim() ? 'No emails match these filters' : 'No emails yet'}
        emptyDescription={
          status || search.trim()
            ? 'Try a different status or recipient.'
            : 'Email jobs appear here once users start sending campaigns.'
        }
      />

      {meta && !loading && !error && meta.total > 0 && (
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
  );
}
