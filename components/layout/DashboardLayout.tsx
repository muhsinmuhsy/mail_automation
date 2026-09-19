'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardHeader } from './DashboardHeader';

const mobileNavItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/emails', label: 'Emails' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/attachments', label: 'Attachments' },
  { href: '/templates', label: 'Templates' },
  { href: '/email-accounts', label: 'Accounts' },
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden md:flex-row">
      <div className="hidden h-full shrink-0 md:block">
        <DashboardSidebar />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <DashboardHeader />
        <nav
          className="flex shrink-0 gap-2 overflow-x-auto border-b border-neutral-200 bg-surface px-4 py-2 md:hidden"
          aria-label="Mobile dashboard navigation"
        >
          {mobileNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-text-secondary hover:bg-selected hover:text-text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="min-h-0 flex-1 overflow-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
