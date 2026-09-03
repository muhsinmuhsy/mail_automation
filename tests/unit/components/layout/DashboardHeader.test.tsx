import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders the account dropdown trigger with a clean label', () => {
    render(<DashboardHeader />);
    expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
  });

  it('renders as a header landmark with a bottom border', () => {
    render(<DashboardHeader />);
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('flex', 'items-center', 'justify-between', 'border-b');
  });

  it('keeps the dropdown menu closed initially', () => {
    render(<DashboardHeader />);
    expect(screen.queryByRole('button', { name: 'Profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('opens the dropdown with the three account items when the trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardHeader />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('closes the dropdown when the trigger is clicked again', async () => {
    const user = userEvent.setup();
    render(<DashboardHeader />);
    const trigger = screen.getByRole('button', { name: 'Account' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.queryByRole('button', { name: 'Profile' })).not.toBeInTheDocument();
  });

  it('invokes the Sign out handler and closes the menu', async () => {
    const user = userEvent.setup();
    render(<DashboardHeader />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('closes the menu when an href-only item without a click handler is selected', async () => {
    const user = userEvent.setup();
    render(<DashboardHeader />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(screen.getByRole('button', { name: 'Profile' }));
    expect(screen.queryByRole('button', { name: 'Profile' })).not.toBeInTheDocument();
  });

  it('renders href-based items as buttons rather than links', async () => {
    const user = userEvent.setup();
    render(<DashboardHeader />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('closes the dropdown when clicking outside of it', async () => {
    const user = userEvent.setup();
    render(<DashboardHeader />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('keeps the dropdown open when clicking inside the menu container', async () => {
    const user = userEvent.setup();
    render(<DashboardHeader />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });
});
