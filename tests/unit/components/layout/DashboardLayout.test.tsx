import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/contacts',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('DashboardLayout', () => {
  it('renders its children inside the main region', () => {
    render(
      <DashboardLayout>
        <p>page body</p>
      </DashboardLayout>
    );
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent('page body');
  });

  it('renders desktop and mobile navigation landmarks', () => {
    render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    expect(screen.getByRole('navigation', { name: 'Dashboard navigation' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Mobile dashboard navigation' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Contacts$/ }).length).toBeGreaterThan(0);
  });

  it('renders the dashboard header', () => {
    render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  });

  it('marks the Dashboard item active for a nested dashboard route via prefix match', () => {
    render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    expect(screen.getAllByRole('link', { name: /Dashboard$/ })[0]).toHaveClass('bg-selected');
  });

  it('applies a responsive full-height shell', () => {
    const { container } = render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    expect(container.firstChild).toHaveClass('min-h-screen', 'flex', 'flex-col', 'md:flex-row');
  });

  it('makes the main content area scrollable with responsive padding', () => {
    render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    expect(screen.getByRole('main')).toHaveClass('flex-1', 'overflow-auto', 'p-4', 'md:p-8');
  });

  it('renders multiple children', () => {
    render(
      <DashboardLayout>
        <p>first</p>
        <p>second</p>
      </DashboardLayout>
    );
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
  });

  it('renders with no visible children content', () => {
    render(<DashboardLayout>{null}</DashboardLayout>);
    expect(screen.getByRole('main')).toBeEmptyDOMElement();
  });

  it('keeps header interactions working inside the layout', async () => {
    const user = userEvent.setup();
    render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('wraps the sidebar before the content column on desktop', () => {
    const { container } = render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.children[0]).toHaveClass('hidden', 'md:block');
    expect(shell.children[1]).toHaveClass('flex', 'min-w-0', 'flex-1', 'flex-col');
  });
});
