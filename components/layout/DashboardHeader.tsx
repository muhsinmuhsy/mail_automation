'use client';

import { useState } from 'react';
import { Dropdown } from '@/components/ui/Dropdown';

export function DashboardHeader() {
  const [greeting, setGreeting] = useState('');

  if (!greeting) {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-background px-8 py-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">Mail Automation</h1>
        <p className="text-sm text-text-secondary">
          {greeting}. Here&apos;s what&apos;s happening today.
        </p>
      </div>
      <Dropdown
        trigger={
          <button className="flex items-center gap-2 rounded-[var(--radius-md)] border border-neutral-200 bg-background px-3 py-2 text-sm font-medium text-text-primary hover:bg-selected">
            Account ▾
          </button>
        }
        items={[
          { label: 'Profile', href: '/profile' },
          { label: 'Settings', href: '/settings' },
          { label: 'Sign out', onClick: () => {} },
        ]}
      />
    </header>
  );
}
