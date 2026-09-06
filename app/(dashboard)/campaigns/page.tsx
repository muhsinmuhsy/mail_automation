'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CampaignWizard,
  type CampaignSelectOption,
  type CampaignSubmitData,
} from '@/components/campaigns/CampaignWizard';
import { CampaignDetails } from '@/components/campaigns/CampaignDetails';
import { formatScheduledTime } from '@/lib/scheduling/time';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
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

const CLOSED_STATUSES = ['CANCELLED', 'COMPLETED'];

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

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  start_at: string;
  timezone: string;
  interval_minutes: number;
  daily_limit: number | null;
}

interface EmailAccountRow {
  id: string;
  provider: string;
  email: string;
  is_active: boolean;
}

interface AttachmentRow {
  id: string;
  filename: string;
  is_default: boolean;
  size_bytes: number | null;
}

interface TemplateRow {
  id: string;
  name: string;
  subject: string;
}

interface ContactRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
  job_title: string | null;
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
  const [detailsId, setDetailsId] = useState<string | null>(null);
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

  const loadCampaignOptions = useCallback(async () => {
    setOptionsLoading(true);
    setOptionsError(null);
    try {
      const [accounts, attachments, templates, contacts] = await Promise.all([
        requestJson<EmailAccountRow[]>('/api/email-accounts?limit=100'),
        requestJson<AttachmentRow[]>('/api/attachments?limit=100'),
        requestJson<TemplateRow[]>('/api/templates?limit=100'),
        requestJson<ContactRow[]>('/api/contacts?limit=100'),
      ]);

      const responses = [accounts, attachments, templates, contacts];
      if (responses.some((response) => response.status === 401)) {
        router.replace('/login');
        return;
      }
      const failure = responses.find((response) => !response.body.success);
      if (failure && !failure.body.success) {
        setOptionsError(failure.body.error.message);
        return;
      }

      setOptions({
        emailAccounts: accounts.body.success
          ? accounts.body.data
              .filter((account) => account.is_active)
              .map((account) => ({
                id: account.id,
                label: `${account.email} (${account.provider})`,
              }))
          : [],
        attachments: attachments.body.success
          ? attachments.body.data.map((attachment) => ({
              id: attachment.id,
              size_bytes: attachment.size_bytes,
              label: attachment.is_default ? `${attachment.filename} (default)` : attachment.filename,
            }))
          : [],
        templates: templates.body.success
          ? templates.body.data.map((template) => ({
              id: template.id,
              label: template.name,
              description: template.subject,
            }))
          : [],
        contacts: contacts.body.success
          ? contacts.body.data.map((contact) => ({
              id: contact.id,
              label: contact.name,
              description: [contact.email, contact.company, contact.job_title].filter(Boolean).join(' - '),
            }))
          : [],
      });
    } catch {
      setOptionsError('Failed to load campaign options.');
    } finally {
      setOptionsLoading(false);
    }
  }, [router]);

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
    if (!showWizard) void loadCampaignOptions();
    setShowWizard((previous) => !previous);
  };

  const filtered = Boolean(status || search.trim());

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title font-semibold">Campaigns</h1>
          <p className="mt-2 text-body text-text-secondary">Create and manage your email campaigns.</p>
        </div>
        <Button variant="primary" onClick={toggleWizard}>
          {showWizard ? 'Cancel' : 'Create campaign'}
        </Button>
      </div>

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
          <Button variant="secondary" size="sm" onClick={() => void loadCampaignOptions()} disabled={optionsLoading}>Refresh available options</Button>
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
                  void loadCampaignOptions();
                }}
              >
                Create campaign
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="divide-y divide-neutral-200 rounded-[var(--radius-lg)] border border-neutral-200 bg-background">
            {campaigns.map((campaign) => {
              const busy = busyCampaignId === campaign.id;
              return (
                <div
                  key={campaign.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text-primary">{campaign.name}</p>
                    <p className="text-caption text-text-secondary">
                      Starts {formatScheduledTime(campaign.start_at, campaign.timezone)}
                      <br />Every {campaign.interval_minutes} minutes ? Daily limit: {campaign.daily_limit ?? 'No campaign limit'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={campaign.status} />
                    <Button variant="secondary" size="sm" onClick={() => setDetailsId(campaign.id)}>View details</Button>
                    {campaign.status === 'ACTIVE' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void runAction(campaign, 'pause')}
                      >
                        Pause
                      </Button>
                    )}
                    {campaign.status === 'PAUSED' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void runAction(campaign, 'resume')}
                      >
                        Resume
                      </Button>
                    )}
                    {!CLOSED_STATUSES.includes(campaign.status) && (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        onClick={() => setCancelTarget(campaign)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

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

      {detailsId && <CampaignDetails campaignId={detailsId} onClose={() => setDetailsId(null)} />}

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title="Cancel campaign"
        description={
          cancelTarget ? `"${cancelTarget.name}" will stop sending and cannot be resumed.` : ''
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
