import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

describe('AdminDashboard', () => {
  it('renders the page title as a level-1 heading', () => {
    render(<AdminDashboard />);
    expect(screen.getByRole('heading', { level: 1, name: 'Admin Dashboard' })).toBeInTheDocument();
  });

  it('renders the descriptive subtitle', () => {
    render(<AdminDashboard />);
    expect(screen.getByText('System overview and management.')).toBeInTheDocument();
  });

  it('renders a vertical flex column wrapper', () => {
    const { container } = render(<AdminDashboard />);
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'gap-6');
  });

  it('styles the heading with the page-title token', () => {
    render(<AdminDashboard />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass(
      'text-page-title',
      'font-semibold'
    );
  });

  it('styles the subtitle as secondary body text', () => {
    render(<AdminDashboard />);
    expect(screen.getByText('System overview and management.')).toHaveClass(
      'text-body',
      'text-text-secondary'
    );
  });

  it('renders the page title heading once and real stat sections when data is provided', () => {
    const stats = {
      totalUsers: 12,
      activeCampaigns: 3,
      emailsSent: 50,
      emailsQueued: 4,
      emailsFailed: 1,
      emailsDeliveryUnknown: 0,
      settings: {
        default_daily_email_limit: 100,
        global_daily_email_limit: 500,
        email_sending_enabled: true,
      },
      recentActivity: [],
    };
    render(<AdminDashboard stats={stats} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Active campaigns')).toBeInTheDocument();
    expect(screen.getByText('Emails queued')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders no interactive controls', () => {
    render(<AdminDashboard />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('produces identical markup across renders (pure component)', () => {
    const first = render(<AdminDashboard />).container.innerHTML;
    const second = render(<AdminDashboard />).container.innerHTML;
    expect(first).toBe(second);
  });
});
