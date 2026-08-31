import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminEmailTable, AdminEmailJobRow } from '@/components/admin/AdminEmailTable';

const sampleJobs: AdminEmailJobRow[] = [
  {
    id: 'e1',
    to_email: 'client@example.com',
    subject: 'Welcome',
    status: 'SENT',
    sent_at: '2026-01-01T11:00:00Z',
    error_message: null,
    created_at: '2026-01-01T10:00:00Z',
    user: { email: 'owner@example.com' },
  },
  {
    id: 'e2',
    to_email: 'fail@example.com',
    subject: 'Oops',
    status: 'FAILED',
    sent_at: null,
    error_message: 'Mailbox full',
    created_at: '2026-01-02T10:00:00Z',
    user: { email: 'other@example.com' },
  },
];

describe('AdminEmailTable', () => {
  it('renders real email rows with their status badges when data is provided', () => {
    render(<AdminEmailTable jobs={sampleJobs} />);
    expect(screen.getByText('client@example.com')).toBeInTheDocument();
    expect(screen.getByText('fail@example.com')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Mailbox full')).toBeInTheDocument();
    // The "Sent" status label appears once as a column header and once as the
    // SENT job's status badge.
    expect(screen.getAllByText('Sent')).toHaveLength(2);
  });

  it('renders the expected column headers for the real data table', () => {
    render(<AdminEmailTable jobs={sampleJobs} />);
    expect(screen.getByRole('columnheader', { name: 'To' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Subject' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'User' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Sent' })).toBeInTheDocument();
  });

  it('shows an empty state instead of a table when no jobs are provided', () => {
    const { container } = render(<AdminEmailTable jobs={[]} />);
    expect(screen.getByText('No emails found')).toBeInTheDocument();
    expect(
      screen.getByText('Email jobs appear here once users start sending campaigns.')
    ).toBeInTheDocument();
    expect(container.querySelector('table')).not.toBeInTheDocument();
  });

  it('uses the medium radius design token', () => {
    const { container } = render(<AdminEmailTable jobs={[]} />);
    expect((container.firstChild as HTMLElement).className).toContain(
      'rounded-[var(--radius-md)]'
    );
  });

  it('renders no interactive controls when there is no data', () => {
    render(<AdminEmailTable />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('takes no props and renders deterministically', () => {
    const a = render(<AdminEmailTable />).container.innerHTML;
    const b = render(<AdminEmailTable />).container.innerHTML;
    expect(a).toBe(b);
  });
});
