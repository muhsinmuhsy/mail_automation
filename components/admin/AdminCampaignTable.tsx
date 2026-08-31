'use client';

import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatusBadge } from '@/components/ui/StatusBadge';

export interface AdminCampaignRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  user: { email: string };
}

interface AdminCampaignTableProps {
  campaigns?: AdminCampaignRow[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onPause?: (campaign: AdminCampaignRow) => void;
  onCancel?: (campaign: AdminCampaignRow) => void;
  /** Id of the campaign with an action in flight. */
  busyCampaignId?: string | null;
}

const CLOSED_STATUSES = ['CANCELLED', 'COMPLETED'];

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function AdminCampaignTable({
  campaigns,
  loading = false,
  error = null,
  onRetry,
  onPause,
  onCancel,
  busyCampaignId = null,
}: AdminCampaignTableProps) {
  if (loading) {
    return (
      <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background">
        <ErrorState title="Could not load campaigns" message={error} onRetry={onRetry} />
      </div>
    );
  }

  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background">
        <EmptyState
          title="No campaigns found"
          description="Campaigns created by users appear here."
        />
      </div>
    );
  }

  const showActions = Boolean(onPause || onCancel);

  return (
    <DataTable
      data={campaigns}
      columns={[
        {
          key: 'name',
          header: 'Name',
          render: (campaign) => <span className="text-text-primary">{campaign.name}</span>,
        },
        {
          key: 'status',
          header: 'Status',
          render: (campaign) => <StatusBadge status={campaign.status} />,
        },
        {
          key: 'user',
          header: 'User',
          render: (campaign) => <span className="text-text-primary">{campaign.user.email}</span>,
        },
        {
          key: 'created_at',
          header: 'Created',
          render: (campaign) => (
            <span className="text-text-secondary">{formatDateTime(campaign.created_at)}</span>
          ),
        },
        ...(showActions
          ? [
              {
                key: 'actions',
                header: 'Actions',
                render: (campaign: AdminCampaignRow) => {
                  const busy = busyCampaignId === campaign.id;
                  const canPause = campaign.status === 'ACTIVE';
                  const canCancel = !CLOSED_STATUSES.includes(campaign.status);
                  if (!canPause && !canCancel) {
                    return <span className="block text-right text-text-secondary">—</span>;
                  }
                  return (
                    <div className="flex justify-end gap-2">
                      {onPause && canPause ? (
                        <Button variant="secondary" size="sm" disabled={busy} onClick={() => onPause(campaign)}>
                          Pause
                        </Button>
                      ) : null}
                      {onCancel && canCancel ? (
                        <Button variant="destructive" size="sm" disabled={busy} onClick={() => onCancel(campaign)}>
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  );
                },
              },
            ]
          : []),
      ]}
    />
  );
}
