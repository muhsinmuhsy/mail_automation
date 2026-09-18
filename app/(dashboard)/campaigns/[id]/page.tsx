'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Toast } from '@/components/ui/Toast';
import { UsageProgress } from '@/components/ui/UsageProgress';
import { formatScheduledTime } from '@/lib/scheduling/time';
import { CampaignProgressBar } from '@/components/campaigns/CampaignProgressBar';
import { EmailList, type EmailRow } from '@/components/emails/EmailList';
import { ListToolbar } from '@/components/ui/ListToolbar';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import type { StatusCount } from '@/lib/campaigns/status-counts';

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

interface CampaignUsageToday {
  sent: number;
  reserved: number;
  limit: number;
  configuredLimit: number | null;
  limitingScope: 'SYSTEM' | 'ACCOUNT' | null;
  limitingLimit: number | null;
  accountSent: number;
  accountReserved: number;
  accountLimit: number;
}

interface EmailJobsPagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface CampaignDetails {
  name: string;
  status: string;
  start_at: string;
  timezone: string;
  interval_minutes: number;
  daily_limit: number | null;
  created_at: string;
  template: { id: string; name: string; subject: string };
  email_account: { id: string; email: string; provider: string };
  _count: { email_jobs: number };
  status_counts?: StatusCount[];
  email_jobs: EmailRow[];
  emailJobsPagination: EmailJobsPagination;
  usageToday: CampaignUsageToday;
}

type ApiEnvelope<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error?: { message?: string } };

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [details, setDetails] = useState<CampaignDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string; type: 'success' | 'error' } | null>(null);
  const toastIdRef = useRef(0);

  const [jobsPage, setJobsPage] = useState(1);
  const [jobsSearch, setJobsSearch] = useState('');
  const [jobsStatus, setJobsStatus] = useState('');

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message, type });
  }, []);

  const buildUrl = useCallback(() => {
    const p = new URLSearchParams({ page: String(jobsPage), limit: String(PAGE_SIZE) });
    if (jobsSearch.trim()) p.set('search', jobsSearch.trim());
    if (jobsStatus) p.set('status', jobsStatus);
    return `/api/campaigns/${campaignId}?${p.toString()}`;
  }, [campaignId, jobsPage, jobsSearch, jobsStatus]);

  useEffect(() => {
    if (!campaignId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const load = async () => {
        try {
          const response = await fetch(buildUrl(), { credentials: 'include', signal: controller.signal });
          const body = (await response.json()) as ApiEnvelope<CampaignDetails>;
          if (!body.success) throw new Error(body.error?.message || 'Could not load campaign details.');
          if (!response.ok) throw new Error('Could not load campaign details.');
          if (!controller.signal.aborted) { setDetails(body.data); setError(null); setLoading(false); }
        } catch (err) {
          if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : 'Could not load campaign details.'); setLoading(false); }
        }
      };
      void load();
      const interval = setInterval(() => void load(), 15_000);
      return () => clearInterval(interval);
    }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [buildUrl, campaignId]);

  const reload = async () => {
    try {
      const response = await fetch(buildUrl(), { credentials: 'include' });
      const body = (await response.json()) as ApiEnvelope<CampaignDetails>;
      if (body.success) setDetails(body.data);
    } catch { /* keep stale data on reload failure */ }
  };

  const retryFailed = async () => {
    setRetrying(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/retry-failed`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await response.json()) as ApiEnvelope<null>;
      if (body.success) {
        showToast(body.message ?? 'Failed emails queued for retry.', 'success');
        await reload();
      } else {
        showToast(body.error?.message ?? 'Failed to retry emails.', 'error');
      }
    } catch {
      showToast('Failed to retry emails.', 'error');
    } finally {
      setRetrying(false);
    }
  };

  const failedCount = details?.status_counts?.find(c => c.status === 'FAILED')?.count ?? 0;
  const canRetry = failedCount > 0 && details?.status !== 'CANCELLED';

  const handleRetryJob = async (job: EmailRow) => {
    setRetryingJobId(job.id);
    try {
      const response = await fetch(`/api/emails/${job.id}/retry`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await response.json()) as ApiEnvelope<null>;
      if (body.success) {
        showToast(body.message ?? 'Email queued for retry.', 'success');
        await reload();
      } else {
        showToast(body.error?.message ?? 'Failed to retry email.', 'error');
      }
    } catch {
      showToast('Failed to retry email.', 'error');
    } finally {
      setRetryingJobId(null);
    }
  };

  const runAction = async (action: 'pause' | 'resume' | 'cancel') => {
    setActionLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await response.json()) as ApiEnvelope<null>;
      if (body.success) {
        showToast(body.message ?? 'Campaign updated.', 'success');
        await reload();
      } else {
        showToast(body.error?.message ?? 'Failed to update campaign.', 'error');
      }
    } catch {
      showToast('Failed to update campaign.', 'error');
    } finally {
      setActionLoading(false);
      setCancelOpen(false);
    }
  };

  const jobsFiltered = Boolean(jobsSearch.trim() || jobsStatus);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{details?.name ?? 'Campaign'}</h1>
          <p className="mt-2 text-text-secondary">Campaign details and delivery progress.</p>
        </div>
        <div className="flex items-center gap-2">
          {details?.status === 'ACTIVE' && (
            <Button variant="secondary" size="sm" disabled={actionLoading} onClick={() => void runAction('pause')}>Pause</Button>
          )}
          {details?.status === 'PAUSED' && (
            <Button variant="secondary" size="sm" disabled={actionLoading} onClick={() => void runAction('resume')}>Resume</Button>
          )}
          {details && !['CANCELLED', 'COMPLETED'].includes(details.status) && (
            <Button variant="destructive" size="sm" disabled={actionLoading} onClick={() => setCancelOpen(true)}>Cancel</Button>
          )}
          <Button variant="secondary" onClick={() => router.push('/campaigns')}>Back</Button>
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      {loading ? (
        <div className="py-12 flex justify-center">
          <LoadingSpinner />
        </div>
      ) : details ? (
        <div className="flex flex-col gap-6">
          <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">{details.name}</h2>
              <StatusBadge status={details.status} />
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex gap-2 text-sm">
                <dt className="text-text-secondary">Template:</dt>
                <dd className="text-text-primary">{details.template.name}</dd>
              </div>
              <div className="flex gap-2 text-sm">
                <dt className="text-text-secondary">Sending account:</dt>
                <dd className="text-text-primary">{details.email_account.email} <span className="text-text-secondary">({details.email_account.provider})</span></dd>
              </div>
              <div className="flex gap-2 text-sm">
                <dt className="text-text-secondary">Start time:</dt>
                <dd className="text-text-primary">{formatScheduledTime(details.start_at, details.timezone)}</dd>
              </div>
              {details._count.email_jobs > 1 && (
                <div className="flex gap-2 text-sm">
                  <dt className="text-text-secondary">Time between emails:</dt>
                  <dd className="text-text-primary">Every {details.interval_minutes} minutes</dd>
                </div>
              )}
              {details._count.email_jobs > 1 && (
                <div className="flex gap-2 text-sm">
                  <dt className="text-text-secondary">Emails per day:</dt>
                  <dd className="text-text-primary">{details.daily_limit ?? 'No campaign limit'}</dd>
                </div>
              )}
              <div className="flex gap-2 text-sm">
                <dt className="text-text-secondary">Recipients:</dt>
                <dd className="text-text-primary">{details._count.email_jobs}</dd>
              </div>
              <div className="flex gap-2 text-sm">
                <dt className="text-text-secondary">Created:</dt>
                <dd className="text-text-primary">{new Date(details.created_at).toLocaleDateString()}</dd>
              </div>
            </dl>

            {details.status_counts && details.status_counts.length > 0 && details._count.email_jobs > 0 && (
              <div className="mt-4 border-t border-neutral-200 pt-4">
                <CampaignProgressBar counts={details.status_counts} total={details._count.email_jobs} variant="detail" />
              </div>
            )}
          </div>

          {details.usageToday && details.usageToday.configuredLimit !== null && details.status === 'ACTIVE' && details.usageToday.limit < details._count.email_jobs && (
            <div>
              {details.usageToday.accountSent + details.usageToday.accountReserved >= details.usageToday.accountLimit ? (
                <UsageProgress
                  sent={details.usageToday.accountSent}
                  reserved={details.usageToday.accountReserved}
                  limit={details.usageToday.accountLimit}
                  label="Account daily limit"
                />
              ) : (
                <UsageProgress
                  sent={details.usageToday.sent}
                  reserved={details.usageToday.reserved}
                  limit={details.usageToday.limit}
                  label={details.usageToday.limitingScope === 'ACCOUNT' || details.usageToday.limitingScope === 'SYSTEM' ? 'Account daily limit' : 'Campaign daily limit'}
                />
              )}
              {details.usageToday.limitingScope === 'ACCOUNT' && details.usageToday.limitingLimit !== null && (
                <p className="mt-1 text-caption text-text-secondary">
                  {'\u24D8'} Your account daily limit is {details.usageToday.limitingLimit}, which is lower than this campaign&apos;s limit.
                </p>
              )}
            </div>
          )}

          <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-text-primary">Delivery progress</h3>
              {canRetry && (
                <Button variant="secondary" size="sm" loading={retrying} onClick={retryFailed}>
                  Retry all failed ({failedCount})
                </Button>
              )}
            </div>

            <div className="mb-4">
              <ListToolbar
                search={jobsSearch}
                onSearchChange={(value) => { setJobsSearch(value); setJobsPage(1); }}
                filters={
                  <div className="sm:w-48">
                    <Select
                      label="Status"
                      options={STATUS_OPTIONS}
                      value={jobsStatus}
                      onChange={(event) => { setJobsStatus(event.target.value); setJobsPage(1); }}
                    />
                  </div>
                }
              />
            </div>

            {details.email_jobs.length === 0 ? (
              <EmptyState
                title={jobsFiltered ? 'No emails match these filters' : 'No emails in this campaign'}
                description={jobsFiltered ? 'Try a different status or recipient.' : 'Emails will appear here once the campaign starts.'}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <EmailList
                  emails={details.email_jobs}
                  onRetry={handleRetryJob}
                  retryingId={retryingJobId}
                  showSubject={false}
                  showCreated={false}
                  timezone={details.timezone}
                />

                {details.emailJobsPagination && details.emailJobsPagination.totalPages > 1 && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-supporting text-text-secondary">
                      {details.emailJobsPagination.total} {details.emailJobsPagination.total === 1 ? 'email' : 'emails'}
                    </p>
                    <Pagination
                      page={details.emailJobsPagination.page}
                      totalPages={details.emailJobsPagination.totalPages}
                      onPageChange={setJobsPage}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel campaign"
        description={details ? `Are you sure you want to cancel "${details.name}"? This action cannot be undone.` : ''}
        confirmLabel="Cancel campaign"
        cancelLabel="Keep campaign"
        variant="destructive"
        loading={actionLoading}
        onConfirm={() => void runAction('cancel')}
      />

      {toast && (
        <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
