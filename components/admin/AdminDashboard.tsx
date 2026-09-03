'use client';

import Link from 'next/link';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatusBadge } from '@/components/ui/StatusBadge';

export interface AdminDashboardSettings {
  default_daily_email_limit: number;
  global_daily_email_limit: number;
  email_sending_enabled: boolean;
}

export interface AdminDashboardActivity {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  created_at: string;
}

export interface AdminDashboardStats {
  totalUsers: number;
  activeCampaigns: number;
  emailsSent: number;
  emailsQueued: number;
  emailsFailed: number;
  emailsDeliveryUnknown: number;
  settings: AdminDashboardSettings | null;
  recentActivity: AdminDashboardActivity[];
}

interface AdminDashboardProps {
  /** System statistics loaded from the admin API. */
  stats?: AdminDashboardStats | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
      <p className="text-supporting text-text-secondary">{label}</p>
      <p className="mt-2 text-page-title font-semibold text-text-primary">{value}</p>
      {hint ? <p className="mt-1 text-caption text-text-secondary">{hint}</p> : null}
    </div>
  );
}

export function AdminDashboard({ stats, loading = false, error = null, onRetry }: AdminDashboardProps) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-page-title font-semibold">Admin Dashboard</h1>
      <p className="text-body text-text-secondary">System overview and management.</p>

      {loading ? (
        <div className="py-12">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !stats ? (
        <EmptyState
          title="No statistics available"
          description="System statistics could not be loaded yet."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {stats.settings && !stats.settings.email_sending_enabled ? (
            <Alert
              type="warning"
              message="Global email sending is disabled. No emails are being delivered for any user."
            />
          ) : null}

          {stats.emailsFailed > 0 || stats.emailsDeliveryUnknown > 0 ? (
            <div className="flex flex-col gap-2">
              <Alert
                type="error"
                message={`${stats.emailsFailed} failed and ${stats.emailsDeliveryUnknown} unknown-delivery emails need review.`}
              />
              <Link href="/admin/emails" className="text-supporting text-information hover:underline">
                Review email jobs
              </Link>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Users" value={String(stats.totalUsers)} hint="registered accounts" />
            <StatCard label="Active campaigns" value={String(stats.activeCampaigns)} hint="currently running" />
            <StatCard label="Emails queued" value={String(stats.emailsQueued)} hint="scheduled or waiting" />
            <StatCard label="Emails sent" value={String(stats.emailsSent)} hint="delivered to providers" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-section-title font-semibold text-text-primary">Sending</h2>
                {stats.settings ? (
                  <Badge variant={stats.settings.email_sending_enabled ? 'success' : 'warning'}>
                    {stats.settings.email_sending_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                ) : null}
              </div>
              {stats.settings ? (
                <dl className="mt-4 flex flex-col gap-2 text-supporting">
                  <div className="flex items-center justify-between">
                    <dt className="text-text-secondary">Default daily limit per user</dt>
                    <dd className="text-text-primary">{stats.settings.default_daily_email_limit}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-text-secondary">Global daily limit</dt>
                    <dd className="text-text-primary">{stats.settings.global_daily_email_limit}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 text-supporting text-text-secondary">
                  System settings are not configured yet.
                </p>
              )}
              <Link
                href="/admin/settings"
                className="mt-4 inline-block text-supporting text-information hover:underline"
              >
                Manage settings
              </Link>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
              <h2 className="text-section-title font-semibold text-text-primary">Needs attention</h2>
              <dl className="mt-4 flex flex-col gap-2 text-supporting">
                <div className="flex items-center justify-between">
                  <dt className="text-text-secondary">Failed emails</dt>
                  <dd className="text-text-primary">{stats.emailsFailed}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-text-secondary">Delivery status unknown</dt>
                  <dd className="text-text-primary">{stats.emailsDeliveryUnknown}</dd>
                </div>
              </dl>
              <Link
                href="/admin/campaigns"
                className="mt-4 inline-block text-supporting text-information hover:underline"
              >
                Manage campaigns
              </Link>
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 p-4">
              <h2 className="text-section-title font-semibold text-text-primary">Recent activity</h2>
              <Link href="/admin/emails" className="text-supporting text-information hover:underline">
                View all
              </Link>
            </div>
            {stats.recentActivity.length === 0 ? (
              <EmptyState title="No email activity yet" description="Emails appear here once campaigns start sending." />
            ) : (
              <ul className="divide-y divide-neutral-200">
                {stats.recentActivity.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-supporting font-medium text-text-primary">{item.subject}</p>
                      <p className="truncate text-caption text-text-secondary">{item.to_email}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
