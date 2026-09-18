'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { UsageProgress } from '@/components/ui/UsageProgress';

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

interface EmailRow {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  sent_at: string | null;
  created_at: string;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

interface DashboardData {
  emailsSent: number;
  emailsQueued: number;
  emailsFailed: number;
  emailsDeliveryUnknown: number;
  activeCampaigns: number;
  recentCampaigns: CampaignRow[];
  recentEmails: EmailRow[];
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<ApiResponse<T>> {
  const response = await fetch(url, { credentials: 'include', signal });
  try {
    return { status: response.status, body: (await response.json()) as Envelope<T> };
  } catch {
    return {
      status: response.status,
      body: { success: false, error: { message: 'Unexpected response from the server.' } },
    };
  }
}

function totalOf(response: ApiResponse<unknown[]>): number {
  return response.body.success ? (response.body.pagination?.total ?? response.body.data.length) : 0;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
      <p className="text-supporting text-text-secondary">{label}</p>
      <p className="mt-2 text-page-title font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-caption text-text-secondary">{hint}</p>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ sent: number; reserved: number; limit: number; limitingScope: 'SYSTEM' | 'ACCOUNT' } | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [sent, queued, scheduled, failed, unknown, active, campaigns, emails] =
          await Promise.all([
            requestJson<unknown[]>('/api/emails?limit=1&status=SENT', signal),
            requestJson<unknown[]>('/api/emails?limit=1&status=QUEUED', signal),
            requestJson<unknown[]>('/api/emails?limit=1&status=SCHEDULED', signal),
            requestJson<unknown[]>('/api/emails?limit=1&status=FAILED', signal),
            requestJson<unknown[]>('/api/emails?limit=1&status=DELIVERY_UNKNOWN', signal),
            requestJson<unknown[]>('/api/campaigns?limit=1&status=ACTIVE', signal),
            requestJson<CampaignRow[]>('/api/campaigns?limit=5', signal),
            requestJson<EmailRow[]>('/api/emails?limit=5', signal),
          ]);

        const responses = [sent, queued, scheduled, failed, unknown, active, campaigns, emails];

        if (responses.some((response) => response.status === 401)) {
          router.replace('/login');
          return;
        }

        const failure = responses.find((response) => !response.body.success);
        if (failure && !failure.body.success) {
          setData(null);
          setError(failure.body.error.message);
          return;
        }

        setData({
          emailsSent: totalOf(sent),
          emailsQueued: totalOf(queued) + totalOf(scheduled),
          emailsFailed: totalOf(failed),
          emailsDeliveryUnknown: totalOf(unknown),
          activeCampaigns: totalOf(active),
          recentCampaigns: campaigns.body.success ? campaigns.body.data : [],
          recentEmails: emails.body.success ? emails.body.data : [],
        });
        setError(null);
      } catch {
        if (signal?.aborted) return;
        setError('Failed to load your dashboard.');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await load(controller.signal);
    })();
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/user/email-limit', { credentials: 'include', signal: controller.signal });
        if (!res.ok) return;
        const body = await res.json() as { success?: boolean; data?: { sentToday?: number; reservedToday?: number; dailyEmailLimit?: number; limitingScope?: 'SYSTEM' | 'ACCOUNT' } };
        if (body.success && body.data) {
          setUsage({ sent: body.data.sentToday ?? 0, reserved: body.data.reservedToday ?? 0, limit: body.data.dailyEmailLimit ?? 0, limitingScope: body.data.limitingScope ?? 'ACCOUNT' });
        }
      } catch { /* aborted */ }
    })();
    return () => controller.abort();
  }, []);

  const retry = () => {
    setLoading(true);
    setError(null);
    void load();
  };

  const problemCount = data ? data.emailsFailed + data.emailsDeliveryUnknown : 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-page-title font-semibold">Dashboard</h1>
          <p className="mt-2 text-body text-text-secondary">Here&apos;s what&apos;s happening today.</p>
        </div>
        <Button variant="primary" size="md" onClick={() => router.push('/campaigns')}>
          Create campaign
        </Button>
      </div>

      {loading ? (
        <div className="py-12">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : !data ? (
        <EmptyState title="No data yet" description="Your sending activity will appear here." />
      ) : (
        <>
          {problemCount > 0 && (
            <div className="flex flex-col gap-2">
              <Alert
                type="warning"
                message={`${data.emailsFailed} failed and ${data.emailsDeliveryUnknown} unknown-delivery emails need your attention.`}
              />
              <Link href="/emails" className="text-supporting text-information hover:underline">
                Review emails
              </Link>
            </div>
          )}

          {usage && (
            <UsageProgress
              sent={usage.sent}
              reserved={usage.reserved}
              limit={usage.limit}
              label={usage.limitingScope === 'SYSTEM' ? 'System daily usage' : 'Account daily usage'}
            />
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Emails sent" value={String(data.emailsSent)} hint="delivered so far" />
            <StatCard label="Queued" value={String(data.emailsQueued)} hint="scheduled or waiting" />
            <StatCard
              label="Active campaigns"
              value={String(data.activeCampaigns)}
              hint="currently running"
            />
            <StatCard label="Needs attention" value={String(problemCount)} hint="failed or unknown" />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-section-title font-semibold text-text-primary">Recent campaigns</h2>
              <Link href="/campaigns" className="text-supporting text-information hover:underline">
                View all
              </Link>
            </div>
            {data.recentCampaigns.length === 0 ? (
              <EmptyState
                title="No campaigns yet"
                description="Create your first campaign to get started."
                action={
                  <Button variant="primary" onClick={() => router.push('/campaigns')}>
                    Create campaign
                  </Button>
                }
              />
            ) : (
              <div className="mt-4 divide-y divide-neutral-200 rounded-[var(--radius-lg)] border border-neutral-200 bg-background">
                {data.recentCampaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-surface"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text-primary">{campaign.name}</p>
                      <p className="text-caption text-text-secondary">
                        Created {new Date(campaign.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <StatusBadge status={campaign.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-section-title font-semibold text-text-primary">Recent emails</h2>
              <Link href="/emails" className="text-supporting text-information hover:underline">
                View all
              </Link>
            </div>
            {data.recentEmails.length === 0 ? (
              <EmptyState
                title="No emails sent yet"
                description="Emails appear here once a campaign starts sending."
              />
            ) : (
              <div className="mt-4 divide-y divide-neutral-200 rounded-[var(--radius-lg)] border border-neutral-200 bg-background">
                {data.recentEmails.map((email) => (
                  <div key={email.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text-primary">{email.subject}</p>
                      <p className="truncate text-caption text-text-secondary">{email.to_email}</p>
                    </div>
                    <StatusBadge status={email.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
