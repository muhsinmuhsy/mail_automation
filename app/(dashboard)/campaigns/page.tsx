'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CampaignWizard,
  type CampaignSelectOption,
  type CampaignSubmitData,
} from '@/components/campaigns/CampaignWizard';
import { CampaignList } from '@/components/campaigns/CampaignList';
import type { CampaignRow } from '@/components/campaigns/CampaignCard';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Pagination } from '@/components/ui/Pagination';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { PageHeader } from '@/components/ui/PageHeader';
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
  | { success: false; error: { type?: string; message: string; fields?: Record<string, string> } };

interface ApiResponse<T> {
  status: number;
  body: Envelope<T>;
}

interface CampaignOptions {
  emailAccounts: CampaignSelectOption[];
  attachments: CampaignSelectOption[];
  templates: CampaignSelectOption[];
  contacts: CampaignSelectOption[];
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

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [options, setOptions] = useState<CampaignOptions>({
    emailAccounts: [],
    attachments: [],
    templates: [],
    contacts: [],
  });
  const optionsRequest = useRef<Promise<void> | null>(null);
  const optionsLoadedAt = useRef(0);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [busyCampaignId, setBusyCampaignId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CampaignRow | null>(null);
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
        const { status: httpStatus, body } = await requestJson<CampaignRow[]>(
          `/api/campaigns?${params.toString()}`,
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

  const loadCampaignOptions = useCallback(() => {
    if (optionsRequest.current) return optionsRequest.current;
    setOptionsLoading(true);
    setOptionsError(null);
    const pending = (async () => {
      try {
        const { status, body } = await requestJson<CampaignOptions>('/api/campaigns/options');
        if (status === 401) { router.replace('/login'); return; }
        if (!body.success) { setOptionsError(body.error.message); return; }
        setOptions(body.data);
        optionsLoadedAt.current = Date.now();
      } catch {
        setOptionsError('Could not load your saved choices. Please try again.');
      } finally {
        setOptionsLoading(false);
        optionsRequest.current = null;
      }
    })();
    optionsRequest.current = pending;
    return pending;
  }, [router]);

  useEffect(() => {
    void loadCampaignOptions();
    const onFocus = () => { if (document.visibilityState === 'visible') void loadCampaignOptions(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadCampaignOptions]);

  const runAction = async (campaign: CampaignRow, action: 'pause' | 'resume' | 'cancel') => {
    setBusyCampaignId(campaign.id);
    try {
      const { status: httpStatus, body } = await requestJson<null>(
        `/api/campaigns/${campaign.id}/${action}`,
        { method: 'POST' }
      );
      if (httpStatus === 401) {
        router.replace('/login');
        return;
      }
      if (body.success) {
        showToast(body.message ?? 'Campaign updated.', 'success');
        await load();
      } else {
        showToast(body.error.message, 'error');
      }
    } finally {
      setBusyCampaignId(null);
      setCancelTarget(null);
    }
  };

  const createCampaign = async (data: CampaignSubmitData) => {
    try {
    const { status: httpStatus, body } = await requestJson<CampaignRow>('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        email_account_id: data.emailAccountId,
        attachment_ids: data.attachmentIds,
        template_id: data.templateId,
        contact_ids: data.contactIds,
        start_at: data.startAt,
        timezone: data.timezone,
        interval_minutes: data.intervalMinutes,
        daily_limit: data.dailyLimit,
        ...(data.missingValueAction ? { missing_value_action: data.missingValueAction } : {}),
      }),
    });

    if (httpStatus === 401) {
      router.replace('/login');
      return;
    }
    if (body.success) {
      showToast(body.message ?? 'Campaign created.', 'success');
      setShowWizard(false);
      setPage(1);
      await load();
    } else {
      showToast(body.error.message, 'error');
    }
    } catch { showToast('Could not confirm campaign creation. Refresh the list before trying again.', 'error'); }
  };

  const toggleWizard = () => {
    if (!showWizard && Date.now() - optionsLoadedAt.current > 60_000) void loadCampaignOptions();
    setShowWizard((previous) => !previous);
  };

  const filtered = Boolean(status || search.trim());

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Campaigns"
        description="Create and manage your email campaigns."
        actions={
          <Button variant="primary" onClick={toggleWizard}>
            {showWizard ? 'Cancel' : 'Create campaign'}
          </Button>
        }
      />

      {showWizard && (
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <p className="mb-4 text-supporting text-text-secondary">
            A campaign needs a connected{' '}
            <Link href="/email-accounts" className="text-information hover:underline">
              email account
            </Link>
            , a{' '}
            <Link href="/templates" className="text-information hover:underline">
              template
            </Link>{' '}
            and at least one{' '}
            <Link href="/contacts" className="text-information hover:underline">
              contact
            </Link>
            . Attachments are optional.
          </p>
          {optionsError && <p role="alert" className="mb-4 text-sm text-error">{optionsError}</p>}
          {optionsError && <Button variant="secondary" size="sm" onClick={() => void loadCampaignOptions()} disabled={optionsLoading}>Try again</Button>}
          <CampaignWizard
            emailAccounts={options.emailAccounts}
            attachments={options.attachments}
            templates={options.templates}
            contacts={options.contacts}
            loading={optionsLoading}
            onSubmit={createCampaign}
          />
        </div>
      )}

      <ListToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        filters={
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
        }
      />

      {loading ? (
        <div className="py-12">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <ErrorState title="Could not load campaigns" message={error} onRetry={retry} />
      ) : campaigns.length === 0 ? (
        <EmptyState
          title={filtered ? 'No campaigns match these filters' : 'No campaigns yet'}
          description={
            filtered
              ? 'Try a different status or name.'
              : 'Create your first campaign to get started.'
          }
          action={
            filtered ? undefined : (
              <Button
                variant="primary"
                onClick={() => {
                  setShowWizard(true);
                  if (Date.now() - optionsLoadedAt.current > 60_000) void loadCampaignOptions();
                }}
              >
                Create campaign
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <CampaignList
            campaigns={campaigns}
            busyId={busyCampaignId}
            onView={(id) => router.push(`/campaigns/${id}`)}
            onPause={(campaign) => void runAction(campaign, 'pause')}
            onResume={(campaign) => void runAction(campaign, 'resume')}
            onCancel={(campaign) => setCancelTarget(campaign)}
          />

          {meta && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-supporting text-text-secondary">
                {meta.total} {meta.total === 1 ? 'campaign' : 'campaigns'}
              </p>
              {meta.totalPages > 1 && (
                <Pagination page={meta.page} totalPages={meta.totalPages} onPageChange={setPage} />
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
        title="Cancel campaign"
        description={cancelTarget ? `Are you sure you want to cancel "${cancelTarget.name}"? This action cannot be undone.` : ''}
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
