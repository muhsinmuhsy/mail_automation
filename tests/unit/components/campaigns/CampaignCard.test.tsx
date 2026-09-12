import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CampaignCard } from '@/components/campaigns/CampaignCard';
import type { CampaignRow } from '@/components/campaigns/CampaignCard';

const campaign: CampaignRow = {
  id: 'c1',
  name: 'Spring outreach',
  status: 'ACTIVE',
  created_at: '2026-01-01T00:00:00Z',
  start_at: '2026-01-15T10:00:00Z',
  timezone: 'UTC',
  interval_minutes: 5,
  daily_limit: 100,
  _count: { email_jobs: 10 },
};

describe('CampaignCard', () => {
  it('renders the campaign name', () => {
    render(<CampaignCard campaign={campaign} />);
    expect(screen.getByText('Spring outreach')).toBeInTheDocument();
  });

  it('renders the name with truncate and font-medium classes', () => {
    render(<CampaignCard campaign={campaign} />);
    expect(screen.getByText('Spring outreach')).toHaveClass('truncate', 'font-medium', 'text-text-primary');
  });

  it('renders a View details button when onView is provided', () => {
    const onView = vi.fn();
    render(<CampaignCard campaign={campaign} onView={onView} />);
    const button = screen.getByRole('button', { name: 'View details' });
    fireEvent.click(button);
    expect(onView).toHaveBeenCalledWith('c1');
  });

  it('renders a Pause button for ACTIVE campaigns when onPause is provided', () => {
    render(<CampaignCard campaign={campaign} onPause={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('renders a Resume button for PAUSED campaigns when onResume is provided', () => {
    render(<CampaignCard campaign={{ ...campaign, status: 'PAUSED' }} onResume={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('renders a Cancel button for non-closed campaigns when onCancel is provided', () => {
    render(<CampaignCard campaign={campaign} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('does not render a Cancel button for COMPLETED campaigns', () => {
    render(<CampaignCard campaign={{ ...campaign, status: 'COMPLETED' }} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('does not render a Cancel button for CANCELLED campaigns', () => {
    render(<CampaignCard campaign={{ ...campaign, status: 'CANCELLED' }} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('disables action buttons when busy is true', () => {
    render(<CampaignCard campaign={campaign} onPause={vi.fn()} busy />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
  });

  it('renders 1 scheduled email text when email_jobs count is 1', () => {
    render(<CampaignCard campaign={{ ...campaign, _count: { email_jobs: 1 } }} />);
    expect(screen.getByText(/1 scheduled email/)).toBeInTheDocument();
  });

  it('renders interval and daily limit text when email_jobs count is not 1', () => {
    render(<CampaignCard campaign={campaign} />);
    expect(screen.getByText(/One email every 5 minutes/)).toBeInTheDocument();
  });
});
