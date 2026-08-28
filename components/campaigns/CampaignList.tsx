'use client';

interface Campaign {
  id: string;
  name: string;
  status: string;
}

export function CampaignList({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <div className="flex flex-col gap-4">
      {campaigns.map((campaign) => (
        <div key={campaign.id} className="rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-text-primary">{campaign.name}</p>
            <p className="text-sm text-text-secondary">Status: {campaign.status}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
