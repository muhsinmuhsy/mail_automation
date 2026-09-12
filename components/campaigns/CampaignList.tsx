'use client';

import { CampaignCard, type CampaignRow } from './CampaignCard';

interface CampaignListProps {
  campaigns: CampaignRow[];
  busyId?: string | null;
  onView?: (id: string) => void;
  onPause?: (campaign: CampaignRow) => void;
  onResume?: (campaign: CampaignRow) => void;
  onCancel?: (campaign: CampaignRow) => void;
}

export function CampaignList({ campaigns, busyId, onView, onPause, onResume, onCancel }: CampaignListProps) {
  return (
    <div className="divide-y divide-neutral-200 rounded-[var(--radius-lg)] border border-neutral-200 bg-background">
      {campaigns.map((campaign) => (
        <CampaignCard
          key={campaign.id}
          campaign={campaign}
          busy={busyId === campaign.id}
          onView={onView}
          onPause={onPause}
          onResume={onResume}
          onCancel={onCancel}
        />
      ))}
    </div>
  );
}
