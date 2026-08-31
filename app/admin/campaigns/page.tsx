'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminCampaignTable, type AdminCampaignRow } from '@/components/admin/AdminCampaignTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Toast } from '@/components/ui/Toast';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
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

interface ApiResponse<T> {
  status: number;
  body: Envelope<T>;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(url, { credentials: 'include', ...init });
  try {
    return { status: response.status, body: (await response.json()) as Envelope<T> };
  } catch {
    return {
      status: response.status,
      body: { success: false, error: { message: 'Unexpected response from the server.' } },
    };
  }
}

export default function AdminCampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<AdminCampaignRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminCampaignRow | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string; type: 'success' | 'error' } | null>(
    null
  );

  const showToast = (message: string, type: 'success' | 'error') =>
    setToast({ id: Date.now(), message, type });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (search.trim()) params.set('search', search.trim());

      try {
        const { status: httpStatus, body } = await requestJson<AdminCampaignRow[]>(
          `/api/admin/campaigns?${params.toString()}`,
          { signal }
        );
        if (httpStatus === 401) {
          router.replace('/login');
          return;
        }
        if (body.success) {
          setCampaigns(body.data);
          setMeta(body.pagination ?? null);
          setError(null);
        } else {
          setCampaigns([]);
          setError(body.error.message);
        }
      } catch {
        if (signal?.aborted) return;
        setCampaigns([]);
        setError('Failed to load campaigns.');
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

  const runAction = async (campaign: AdminCampaignRow, action: 'pause' | 'cancel') => {
    setBusyCampaignId(campaign.id);
    try {
      const { status: httpStatus, body } = await requestJson<null>(
        `/api/admin/campaigns/${campaign.id}/${action}`,
        { method: 'POST' }
      );
      if (httpStatus === 401) {
        router.replace('/login');
        return;
      }
      if (body.success) {
        showToast(
          body.message ?? (action === 'pause' ? 'Campaign paused.' : 'Campaign cancelled.'),
          'success'
        );
        await load();
      } else {
        showToast(body.error.message, 'error');
      }
    } finally {
      setBusyCampaignId(null);
      setCancelTarget(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-2 text-body text-text-secondary">
          All campaigns across all users. Pause or cancel a campaign that needs to stop sending.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:max-w-sm sm:flex-1">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search by campaign name"
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

      <AdminCampaignTable
        campaigns={campaigns}
        loading={loading}
        error={error}
        onRetry={retry}
        busyCampaignId={busyCampaignId}
        onPause={(campaign) => void runAction(campaign, 'pause')}
        onCancel={(campaign) => setCancelTarget(campaign)}
      />

      {meta && !loading && !error && meta.total > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-supporting text-text-secondary">
            {meta.total} {meta.total === 1 ? 'campaign' : 'campaigns'}
          </p>
          {meta.totalPages > 1 && (
            <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
          )}
        </div>
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title="Cancel campaign"
        description={
          cancelTarget
            ? `"${cancelTarget.name}" will stop sending and cannot be resumed.`
            : ''
        }
        confirmLabel="Cancel campaign"
        cancelLabel="Keep campaign"
        variant="destructive"
        loading={busyCampaignId !== null}
        onConfirm={() => {
          if (cancelTarget) void runAction(cancelTarget, 'cancel');
        }}
      />

      {toast && (
        <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
