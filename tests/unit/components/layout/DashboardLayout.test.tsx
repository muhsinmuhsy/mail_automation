import { describe, it, expect, vi } from 'vitest';
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

  it('renders the sidebar navigation', () => {
    render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Contacts$/ })).toBeInTheDocument();
  });

  it('renders the dashboard header', () => {
    render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account ▾' })).toBeInTheDocument();
  });

  it('marks the Dashboard item active for a nested dashboard route via prefix match', () => {
    render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    expect(screen.getByRole('link', { name: /Dashboard$/ })).toHaveClass('bg-selected');
  });

  it('applies a full-height flex shell', () => {
    const { container } = render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    expect(container.firstChild).toHaveClass('min-h-screen', 'flex');
  });

  it('makes the main content area scrollable with padding', () => {
    render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    expect(screen.getByRole('main')).toHaveClass('flex-1', 'p-8', 'overflow-auto');
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
    await user.click(screen.getByRole('button', { name: 'Account ▾' }));
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('orders the sidebar before the content column', () => {
    const { container } = render(
      <DashboardLayout>
        <span>x</span>
      </DashboardLayout>
    );
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.children[0].tagName).toBe('ASIDE');
    expect(shell.children[1]).toHaveClass('flex-1', 'min-w-0', 'flex', 'flex-col');
  });
});
