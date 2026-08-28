'use client';

interface Campaign {
  id: string;
  name: string;
  status: string;
}

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4">
      <p className="font-medium text-text-primary">{campaign.name}</p>
      <p className="text-sm text-text-secondary">Status: {campaign.status}</p>
    </div>
  );
}
