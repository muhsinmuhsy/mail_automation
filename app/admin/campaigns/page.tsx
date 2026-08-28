'use client';

import { useState, useEffect } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';

interface Campaign {
  id: string;
  name: string;
  status: string;
  created_at: string;
  user: { email: string };
}

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/campaigns')
      .then((r) => r.json())
      .then((res) => {
        if ((res as { success: boolean }).success) setCampaigns((res as { success: boolean; data: Campaign[] }).data);
        else setError((res as { error?: { message: string } }).error?.message || 'Failed to load campaigns.');
      })
      .catch(() => setError('Failed to load campaigns.'))
      .finally(() => setLoading(false));
  }, []);

  const updateCampaign = async (id: string, action: string) => {
    await fetch(`/api/campaigns/${id}/${action}`, { method: 'POST' });
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status: action === 'pause' ? 'PAUSED' : action === 'cancel' ? 'CANCELLED' : c.status } : c)));
  };

  if (loading) return <div className="text-text-secondary">Loading campaigns...</div>;
  if (error) return <div className="text-error">{error}</div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-2 text-text-secondary">All campaigns across all users.</p>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-neutral-200 bg-background">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">User</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-background">
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td className="px-4 py-4 text-sm text-text-primary">{campaign.name}</td>
                <td className="px-4 py-4 text-sm">
                  <StatusBadge status={campaign.status} />
                </td>
                <td className="px-4 py-4 text-sm text-text-primary">{campaign.user.email}</td>
                <td className="px-4 py-4 text-right text-sm">
                  {campaign.status === 'ACTIVE' && (
                    <Button variant="secondary" size="sm" onClick={() => updateCampaign(campaign.id, 'pause')}>
                      Pause
                    </Button>
                  )}
                  {campaign.status !== 'CANCELLED' && campaign.status !== 'COMPLETED' && (
                    <Button variant="destructive" size="sm" onClick={() => updateCampaign(campaign.id, 'cancel')}>
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
