'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/email-accounts', label: 'Email Accounts', icon: '📧' },
  { href: '/resumes', label: 'Resumes', icon: '📄' },
  { href: '/contacts', label: 'Contacts', icon: '👥' },
  { href: '/templates', label: 'Templates', icon: '📝' },
  { href: '/campaigns', label: 'Campaigns', icon: '🚀' },
  { href: '/emails', label: 'Emails', icon: '✉️' },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-neutral-200 bg-surface flex flex-col">
      <div className="p-6">
        <h2 className="text-lg font-semibold tracking-tight">Mail Automation</h2>
      </div>
      <nav className="flex flex-col gap-1 px-3 py-2 flex-1">
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
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-neutral-200">
        <p className="text-xs text-text-secondary">© 2026 Mail Automation</p>
      </div>
    </aside>
  );
}
