'use client';

import { useState, useEffect } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface EmailJob {
  id: string;
  to_email: string;
  subject: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  user: { email: string };
}

export default function AdminEmailsPage() {
  const [jobs, setJobs] = useState<EmailJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/emails?limit=50')
      .then((r) => r.json())
      .then((res) => {
        if ((res as { success: boolean }).success) setJobs((res as { success: boolean; data: { jobs: EmailJob[] } }).data.jobs);
        else setError((res as { error?: { message: string } }).error?.message || 'Failed to load emails.');
      })
      .catch(() => setError('Failed to load emails.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-text-secondary">Loading emails...</div>;
  if (error) return <div className="text-error">{error}</div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Emails</h1>
        <p className="mt-2 text-text-secondary">Recent email jobs across all users.</p>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-neutral-200 bg-background">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">To</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">Subject</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-secondary">Sent At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-background">
            {jobs.map((job) => (
              <tr key={job.id}>
                <td className="px-4 py-4 text-sm text-text-primary">{job.to_email}</td>
                <td className="px-4 py-4 text-sm text-text-primary">{job.subject}</td>
                <td className="px-4 py-4 text-sm">
                  <StatusBadge status={job.status} />
                </td>
                <td className="px-4 py-4 text-sm text-text-primary">{job.user.email}</td>
                <td className="px-4 py-4 text-sm text-text-secondary">{job.sent_at ? new Date(job.sent_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
