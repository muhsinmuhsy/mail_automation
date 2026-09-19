'use client';

import { Button } from '@/components/ui/Button';
import { signOut } from '@/app/(auth)/logout/actions';

export function DashboardHeader() {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-background px-4 py-4 md:px-8">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-text-primary">Mail Automation</h1>
        <p className="hidden text-sm text-text-secondary sm:block">
          Welcome. Here&apos;s what&apos;s happening today.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => { void signOut(); }}>
        Sign out
      </Button>
    </header>
  );
}
