'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';

const mockStats = [
  { label: 'Emails sent today', value: '18/20', subtext: 'of daily limit' },
  { label: 'Queued', value: '12', subtext: 'pending send' },
  { label: 'Active campaigns', value: '3', subtext: 'running' },
  { label: 'Failed', value: '2', subtext: 'need attention', variant: 'error' as const },
];

const mockCampaigns = [
  { id: '1', name: 'Welcome Series', status: 'ACTIVE', sent: 156, queued: 24 },
  { id: '2', name: 'Follow-up Campaign', status: 'PAUSED', sent: 89, queued: 0 },
  { id: '3', name: 'Newsletter', status: 'SENT', sent: 1200, queued: 0 },
];

export default function DashboardPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-2 text-text-secondary">Here&apos;s what&apos;s happening today.</p>
        </div>
        <Button variant="primary" size="md" onClick={() => router.push('/dashboard/campaigns/new')}>
          Create campaign
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {mockStats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-gray-200 bg-white p-6">
            <p className="text-sm text-text-secondary">{stat.label}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-3xl font-semibold">{stat.value}</p>
              {stat.variant === 'error' && <StatusBadge status="FAILED" />}
            </div>
            <p className="mt-1 text-xs text-text-secondary">{stat.subtext}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-xl font-semibold">Recent campaigns</h2>
        {mockCampaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create your first campaign to get started."
            action={
              <Button variant="primary" onClick={() => router.push('/dashboard/campaigns/new')}>
                Create campaign
              </Button>
            }
          />
        ) : (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white divide-y divide-gray-200">
            {mockCampaigns.map((campaign) => (
              <div key={campaign.id} className="p-4 flex items-center justify-between hover:bg-surface transition-colors">
                <div>
                  <p className="font-medium text-text-primary">{campaign.name}</p>
                  <p className="text-sm text-text-secondary">
                    {campaign.sent} sent · {campaign.queued} queued
                  </p>
                </div>
                <StatusBadge status={campaign.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
