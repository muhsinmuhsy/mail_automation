'use client';

import { formatScheduledTime } from '@/lib/scheduling/time';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmailStatusBreakdown } from './EmailStatusBreakdown';
import type { StatusCount } from '@/lib/campaigns/status-counts';

const CLOSED_STATUSES = ['CANCELLED', 'COMPLETED'];

export interface CampaignRow {
  _count?: { email_jobs: number };
  status_counts?: StatusCount[];
  id: string;
  name: string;
  status: string;
  created_at: string;
  start_at: string;
  timezone: string;
  interval_minutes: number;
  daily_limit: number | null;
}

interface CampaignCardProps {
  campaign: CampaignRow;
  busy?: boolean;
  onView?: (id: string) => void;
  onPause?: (campaign: CampaignRow) => void;
  onResume?: (campaign: CampaignRow) => void;
  onCancel?: (campaign: CampaignRow) => void;
}

export function CampaignCard({ campaign, busy = false, onView, onPause, onResume, onCancel }: CampaignCardProps) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium text-text-primary">{campaign.name}</p>
        <p className="text-caption text-text-secondary">
          Starts {formatScheduledTime(campaign.start_at, campaign.timezone)}
          <br />{campaign._count?.email_jobs === 1 ? '1 scheduled email' : <>One email every {campaign.interval_minutes} minutes. Emails per day: {campaign.daily_limit ?? 'No campaign limit'}</>}
        </p>
        {campaign.status_counts && campaign.status_counts.length > 0 && (
          <div className="mt-1.5">
            <EmailStatusBreakdown counts={campaign.status_counts} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={campaign.status} />
        {onView && (
          <Button variant="secondary" size="sm" onClick={() => onView(campaign.id)}>View details</Button>
        )}
        {campaign.status === 'ACTIVE' && onPause && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => onPause(campaign)}>Pause</Button>
        )}
        {campaign.status === 'PAUSED' && onResume && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => onResume(campaign)}>Resume</Button>
        )}
        {!CLOSED_STATUSES.includes(campaign.status) && onCancel && (
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => onCancel(campaign)}>Cancel</Button>
        )}
      </div>
    </div>
  );
}
