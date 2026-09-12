import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockSignOut } = vi.hoisted(() => ({ mockSignOut: vi.fn() }));
vi.mock('@/app/(auth)/logout/actions', () => ({
  signOut: mockSignOut,
}));

import { DashboardHeader } from '@/components/layout/DashboardHeader';

describe('DashboardHeader', () => {
  it('renders the product title', () => {
    render(<DashboardHeader />);
    expect(screen.getByRole('heading', { name: 'Mail Automation' })).toBeInTheDocument();
  });

  it('renders the welcome subtitle', () => {
    render(<DashboardHeader />);
    expect(screen.getByText("Welcome. Here's what's happening today.")).toBeInTheDocument();
  });

  it('renders a direct sign out button', () => {
    render(<DashboardHeader />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('does not render an account dropdown trigger', () => {
    render(<DashboardHeader />);
    expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
  });

  it('does not render a Profile button', () => {
    render(<DashboardHeader />);
    expect(screen.queryByRole('button', { name: 'Profile' })).not.toBeInTheDocument();
  });

  it('renders as a header landmark with a bottom border', () => {
    render(<DashboardHeader />);
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('flex', 'items-center', 'justify-between', 'border-b');
  });

  it('invokes the signOut server action when the sign out button is clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardHeader />);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
