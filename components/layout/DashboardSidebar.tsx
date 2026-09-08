'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: 'DB' },
  { href: '/email-accounts', label: 'Email Accounts', icon: 'EA' },
  { href: '/attachments', label: 'Attachments', icon: 'AT' },
  { href: '/contacts', label: 'Contacts', icon: 'CT' },
  { href: '/templates', label: 'Templates', icon: 'TP' },
  { href: '/campaigns', label: 'Campaigns', icon: 'CP' },
  { href: '/emails', label: 'Emails', icon: 'EM' },
  { href: '/settings/fields', label: 'Settings', icon: 'ST' },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-surface">
      <div className="p-6">
        <h2 className="text-lg font-semibold">Mail Automation</h2>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2" aria-label="Dashboard navigation">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-selected text-text-primary'
                  : 'text-text-secondary hover:bg-selected hover:text-text-primary'
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-background text-[10px] font-semibold text-text-secondary"
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-neutral-200 p-4">
        <p className="text-xs text-text-secondary">2026 Mail Automation</p>
      </div>
    </aside>
  );
}
