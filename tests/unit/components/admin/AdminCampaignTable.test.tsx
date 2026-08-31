import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminCampaignTable, AdminCampaignRow } from '@/components/admin/AdminCampaignTable';

const sampleCampaigns: AdminCampaignRow[] = [
  {
    id: 'c1',
    name: 'Spring Launch',
    status: 'ACTIVE',
    created_at: '2026-01-01T10:00:00Z',
    user: { email: 'owner@example.com' },
  },
  {
    id: 'c2',
    name: 'Winter Follow-up',
    status: 'COMPLETED',
    created_at: '2026-02-01T10:00:00Z',
    user: { email: 'other@example.com' },
  },
];

describe('AdminCampaignTable', () => {
  it('renders real campaign rows with their status badges when data is provided', () => {
    render(<AdminCampaignTable campaigns={sampleCampaigns} />);
    expect(screen.getByText('Spring Launch')).toBeInTheDocument();
    expect(screen.getByText('Winter Follow-up')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders the expected column headers for the real data table', () => {
    render(<AdminCampaignTable campaigns={sampleCampaigns} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
  });

  it('shows an empty state instead of a table when no campaigns are provided', () => {
    const { container } = render(<AdminCampaignTable campaigns={[]} />);
    expect(screen.getByText('No campaigns found')).toBeInTheDocument();
    expect(
      screen.getByText('Campaigns created by users appear here.')
    ).toBeInTheDocument();
    expect(container.querySelector('table')).not.toBeInTheDocument();
  });

  it('uses the medium radius design token', () => {
    const { container } = render(<AdminCampaignTable campaigns={[]} />);
    expect((container.firstChild as HTMLElement).className).toContain(
      'rounded-[var(--radius-md)]'
    );
  });

  it('renders no interactive controls when there is no data', () => {
    render(<AdminCampaignTable />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('takes no props and renders deterministically', () => {
    const a = render(<AdminCampaignTable />).container.innerHTML;
    const b = render(<AdminCampaignTable />).container.innerHTML;
    expect(a).toBe(b);
  });
});
