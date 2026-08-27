'use client';

import { useState, useEffect } from 'react';

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

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">User</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td className="px-4 py-4 text-sm">{campaign.name}</td>
                <td className="px-4 py-4 text-sm">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(campaign.status)}`}>
                    {campaign.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm">{campaign.user.email}</td>
                <td className="px-4 py-4 text-right text-sm">
                  {campaign.status === 'ACTIVE' && (
                    <button onClick={() => updateCampaign(campaign.id, 'pause')} className="rounded-md px-3 py-1.5 text-sm hover:bg-gray-100">Pause</button>
                  )}
                  {campaign.status !== 'CANCELLED' && campaign.status !== 'COMPLETED' && (
                    <button onClick={() => updateCampaign(campaign.id, 'cancel')} className="rounded-md px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Cancel</button>
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

function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'bg-green-50 text-green-700';
    case 'PAUSED': return 'bg-yellow-50 text-yellow-700';
    case 'DRAFT': return 'bg-gray-50 text-gray-700';
    case 'CANCELLED': return 'bg-red-50 text-red-700';
    case 'COMPLETED': return 'bg-blue-50 text-blue-700';
    default: return 'bg-gray-50 text-gray-700';
  }
}
