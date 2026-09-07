'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatScheduledTime } from '@/lib/scheduling/time';

interface Details {
  name: string;
  start_at: string;
  timezone: string;
  interval_minutes: number;
  daily_limit: number | null;
  _count: { email_jobs: number };
  email_jobs: { id: string; to_email: string; status: string; scheduled_at: string; sent_at: string | null }[];
}

export function CampaignDetails({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/campaigns/${campaignId}`, { credentials: 'include', signal: controller.signal });
        const body = await response.json() as
          | { success: true; data: Details }
          | { success: false; error?: { message?: string } };
        if (!body.success) throw new Error(body.error?.message || 'Could not load campaign details.');
        if (!response.ok) throw new Error('Could not load campaign details.');
        if (!controller.signal.aborted) { setDetails(body.data); setError(null); }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load campaign details.');
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [campaignId]);

  return (
    <dialog open aria-labelledby="campaign-details-title" className="fixed inset-0 z-50 m-auto max-h-[85vh] w-[min(95vw,56rem)] overflow-auto rounded-lg border border-neutral-200 bg-background p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="campaign-details-title" className="text-lg font-semibold">{details?.name ?? 'Campaign details'}</h2>
        <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!details && !error && <p>Loading campaign details…</p>}
      {details && <>
        <dl className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><dt>Start time</dt><dd>{formatScheduledTime(details.start_at, details.timezone)}</dd></div>
          {details._count.email_jobs > 1 && <div><dt>Time between emails</dt><dd>Every {details.interval_minutes} minutes</dd></div>}
          {details._count.email_jobs > 1 && <div><dt>Emails per day</dt><dd>{details.daily_limit ?? 'No campaign limit'}</dd></div>}
          <div><dt>Recipients</dt><dd>{details._count.email_jobs}</dd></div>
        </dl>
        <h3 className="mb-2 font-semibold">Delivery progress</h3>
        <p className="mb-3 text-sm text-text-secondary">Showing {details.email_jobs.length} of {details._count.email_jobs} emails. Statuses refresh every 15 seconds.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr><th className="p-2">Recipient</th><th className="p-2">Scheduled for</th><th className="p-2">Status</th><th className="p-2">Sent</th></tr></thead>
          <tbody>{details.email_jobs.map((job) => <tr key={job.id} className="border-t border-neutral-200">
            <td className="p-2">{job.to_email}</td><td className="p-2">{formatScheduledTime(job.scheduled_at, details.timezone)}</td>
            <td className="p-2"><StatusBadge status={job.status} /></td><td className="p-2">{formatScheduledTime(job.sent_at, details.timezone)}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </dialog>
  );
}
