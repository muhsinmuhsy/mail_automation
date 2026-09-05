import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardSidebar } from '@/components/layout/DashboardSidebar';

const { pathnameRef } = vi.hoisted(() => ({ pathnameRef: { current: '/dashboard' } }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const ALL_LABELS = [
  'Dashboard',
  'Email Accounts',
  'Attachments',
  'Contacts',
  'Templates',
  'Campaigns',
  'Emails',
];

const ACTIVE_CLASS = 'bg-selected';
const INACTIVE_CLASS = 'text-text-secondary';

function linkFor(label: string): HTMLAnchorElement {
  return screen.getByRole('link', { name: new RegExp(`${label}$`) }) as HTMLAnchorElement;
}

describe('DashboardSidebar', () => {
  beforeEach(() => {
    pathnameRef.current = '/dashboard';
  });

  it('renders the product name heading', () => {
    render(<DashboardSidebar />);
    expect(screen.getByRole('heading', { name: 'Mail Automation' })).toBeInTheDocument();
  });

  it('renders every navigation item as an anchor', () => {
    render(<DashboardSidebar />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(ALL_LABELS.length);
    for (const link of links) {
      expect(link.tagName).toBe('A');
    }
  });

  it.each([
    ['Dashboard', '/dashboard'],
    ['Email Accounts', '/email-accounts'],
    ['Attachments', '/attachments'],
    ['Contacts', '/contacts'],
    ['Templates', '/templates'],
    ['Campaigns', '/campaigns'],
    ['Emails', '/emails'],
  ])('links %s to %s', (label, href) => {
    render(<DashboardSidebar />);
    expect(linkFor(label)).toHaveAttribute('href', href);
  });

  it('renders clean text markers for each nav item', () => {
    render(<DashboardSidebar />);
    for (const icon of ['DB', 'EA', 'AT', 'CT', 'TP', 'CP', 'EM']) {
      expect(screen.getByText(icon)).toBeInTheDocument();
    }
  });

  it('marks the item matching the pathname exactly as active', () => {
    pathnameRef.current = '/contacts';
    render(<DashboardSidebar />);
    expect(linkFor('Contacts')).toHaveClass(ACTIVE_CLASS);
    expect(linkFor('Attachments')).toHaveClass(INACTIVE_CLASS);
  });

  it('marks an item active when the pathname is a nested child route', () => {
    pathnameRef.current = '/campaigns/abc-123/edit';
    render(<DashboardSidebar />);
    expect(linkFor('Campaigns')).toHaveClass(ACTIVE_CLASS);
  });

  it('marks only Dashboard active on the dashboard root', () => {
    pathnameRef.current = '/dashboard';
    render(<DashboardSidebar />);
    expect(linkFor('Dashboard')).toHaveClass(ACTIVE_CLASS);
    for (const label of ALL_LABELS.filter((item) => item !== 'Dashboard')) {
      expect(linkFor(label)).toHaveClass(INACTIVE_CLASS);
    }
  });

  it('marks Dashboard active for any nested dashboard route via prefix match', () => {
    pathnameRef.current = '/dashboard/attachments';
    render(<DashboardSidebar />);
    expect(linkFor('Dashboard')).toHaveClass(ACTIVE_CLASS);
    expect(linkFor('Attachments')).toHaveClass(INACTIVE_CLASS);
  });

  it('marks nothing active for an unrelated pathname', () => {
    pathnameRef.current = '/settings';
    render(<DashboardSidebar />);
    for (const label of ALL_LABELS) {
      expect(linkFor(label)).toHaveClass(INACTIVE_CLASS);
      expect(linkFor(label)).not.toHaveClass(ACTIVE_CLASS);
    }
  });

  it('renders the footer year and product name', () => {
    render(<DashboardSidebar />);
    expect(screen.getByText('2026 Mail Automation')).toBeInTheDocument();
  });

  it('allows clicking a nav link without throwing', async () => {
    const user = userEvent.setup();
    render(<DashboardSidebar />);
    await user.click(linkFor('Emails'));
    expect(linkFor('Emails')).toBeInTheDocument();
  });
});
