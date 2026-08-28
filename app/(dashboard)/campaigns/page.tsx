'use client';

import { CampaignCard } from '@/components/campaigns/CampaignCard';
import { CampaignWizard } from '@/components/campaigns/CampaignWizard';
import { EmptyState } from '@/components/ui/EmptyState';
import { useState } from 'react';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [showWizard, setShowWizard] = useState(false);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-2 text-text-secondary">Create and manage your email campaigns.</p>
        </div>
        <button
          onClick={() => setShowWizard(!showWizard)}
          className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-information px-4 py-2 text-sm font-medium text-white hover:bg-information/90"
        >
          {showWizard ? 'Cancel' : 'Create campaign'}
        </button>
      </div>

      {showWizard && (
        <div className="rounded-[var(--radius-lg)] border border-neutral-200 bg-background p-6">
          <CampaignWizard onSubmit={(data) => {
            setCampaigns((prev) => [...prev, { id: Date.now().toString(), name: (data as { name: string }).name, status: 'DRAFT' }]);
            setShowWizard(false);
          }} />
        </div>
      )}

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create your first campaign to get started."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}
