'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Toast } from '@/components/ui/Toast';
import { UsageProgress } from '@/components/ui/UsageProgress';
import { formatScheduledTime } from '@/lib/scheduling/time';

interface CampaignUsageToday {
  sent: number;
  reserved: number;
  limit: number | null;
}

interface CampaignDetails {
  name: string;
  status: string;
  start_at: string;
  timezone: string;
  interval_minutes: number;
  daily_limit: number | null;
  created_at: string;
  _count: { email_jobs: number };
  email_jobs: { id: string; to_email: string; status: string; scheduled_at: string; sent_at: string | null; error_message: string | null; next_attempt_at: string | null }[];
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
  const [toast, setToast] = useState<{ id: number; message: string; type: 'success' | 'error' } | null>(null);
  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message, type });
  }, []);

  useEffect(() => {
    if (!campaignId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const load = async () => {
        try {
          const response = await fetch(`/api/campaigns/${campaignId}`, { credentials: 'include', signal: controller.signal });
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
    }, 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [campaignId]);

  const reload = async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, { credentials: 'include' });
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

  const failedCount = details?.email_jobs.filter((j) => j.status === 'FAILED').length ?? 0;
  const canRetry = failedCount > 0 && details?.status !== 'CANCELLED';

  const handleRetryJob = async (jobId: string) => {
    setRetryingJobId(jobId);
    try {
      const response = await fetch(`/api/emails/${jobId}/retry`, {
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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{details?.name ?? 'Campaign'}</h1>
          <p className="mt-2 text-text-secondary">Campaign details and delivery progress.</p>
        </div>
        <Button variant="secondary" onClick={() => router.push('/campaigns')}>Back</Button>
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
          </div>

          {details.usageToday && details.usageToday.limit !== null && (
            <UsageProgress
              sent={details.usageToday.sent}
              reserved={details.usageToday.reserved}
              limit={details.usageToday.limit}
              label="Campaign daily usage"
            />
          )}

          <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold text-text-primary">Delivery progress</h3>
              {canRetry && (
                <Button variant="secondary" size="sm" loading={retrying} onClick={retryFailed}>
                  Retry all failed ({failedCount})
                </Button>
              )}
            </div>
            <p className="mb-3 text-sm text-text-secondary">
              Showing {details.email_jobs.length} of {details._count.email_jobs} emails. Statuses refresh every 15 seconds.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Recipient</th>
                    <th className="p-2">Scheduled for</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Sent</th>
                    <th className="p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {details.email_jobs.map((job) => (
                    <tr key={job.id} className="border-t border-neutral-200">
                      <td className="p-2">{job.to_email}</td>
                      <td className="p-2">{formatScheduledTime(job.scheduled_at, details.timezone)}</td>
                      <td className="p-2">
                        <StatusBadge status={job.status} />
                        {job.error_message && job.status !== 'SENT' && (
                          <p className="mt-1 text-caption text-text-secondary">{job.error_message}</p>
                        )}
                        {job.next_attempt_at && job.status === 'RETRY_WAIT' && (
                          <p className="text-caption">Retry: {formatScheduledTime(job.next_attempt_at, details.timezone)}</p>
                        )}
                      </td>
                      <td className="p-2">{formatScheduledTime(job.sent_at, details.timezone)}</td>
                      <td className="p-2">
                        {job.status === 'FAILED' || job.status === 'RETRY_WAIT' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={retryingJobId === job.id}
                            disabled={retryingJobId !== null && retryingJobId !== job.id}
                            onClick={() => handleRetryJob(job.id)}
                          >
                            Retry
                          </Button>
                        ) : (
                          <span className="text-text-secondary">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {toast && (
        <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
