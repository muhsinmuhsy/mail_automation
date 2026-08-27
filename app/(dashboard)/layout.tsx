import Link from 'next/link';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/email-accounts', label: 'Email Accounts' },
  { href: '/dashboard/resumes', label: 'Resumes' },
  { href: '/dashboard/contacts', label: 'Contacts' },
  { href: '/dashboard/templates', label: 'Templates' },
  { href: '/dashboard/campaigns', label: 'Campaigns' },
  { href: '/dashboard/emails', label: 'Emails' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 border-r border-gray-200 bg-surface">
        <div className="p-4">
          <h2 className="text-lg font-semibold">Mail Automation</h2>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm hover:bg-selected"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">
        {children}
      </main>
    </div>
  );
}
