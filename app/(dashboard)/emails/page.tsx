'use client';

import { EmptyState } from '@/components/ui/EmptyState';

export default function EmailsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Emails</h1>
        <p className="mt-2 text-text-secondary">View your email sending history.</p>
      </div>

      <EmptyState
        title="No emails sent yet"
        description="Emails will appear here once you start a campaign."
      />
    </div>
  );
}
