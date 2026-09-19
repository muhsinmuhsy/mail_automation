import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmailList } from '@/components/emails/EmailList';
import type { EmailRow } from '@/components/emails/EmailList';

const emails: EmailRow[] = [
  { id: 'e1', subject: 'First subject', to_email: 'one@example.com', status: 'SENT', scheduled_at: '2026-01-01T10:00:00Z', next_attempt_at: null, error_message: null, campaign: { timezone: 'UTC', name: 'Camp A' }, sent_at: '2026-01-01T10:05:00Z', created_at: '2026-01-01T09:00:00Z' },
  { id: 'e2', subject: 'Second subject', to_email: 'two@example.com', status: 'FAILED', scheduled_at: '2026-01-02T10:00:00Z', next_attempt_at: null, error_message: 'SMTP timeout', campaign: { timezone: 'UTC', name: 'Camp B' }, sent_at: null, created_at: '2026-01-02T09:00:00Z' },
  { id: 'e3', subject: 'Third subject', to_email: 'three@example.com', status: 'QUEUED', scheduled_at: '2026-01-03T10:00:00Z', next_attempt_at: null, error_message: null, campaign: { timezone: 'UTC', name: 'Camp C' }, sent_at: null, created_at: '2026-01-03T09:00:00Z' },
];

describe('EmailList', () => {
  it('renders the data table with emails', () => {
    render(<EmailList emails={emails} />);
    expect(screen.getByText('First subject')).toBeInTheDocument();
    expect(screen.getByText('one@example.com')).toBeInTheDocument();
    expect(screen.getByText('Second subject')).toBeInTheDocument();
    expect(screen.getByText('two@example.com')).toBeInTheDocument();
    expect(screen.getByText('Third subject')).toBeInTheDocument();
    expect(screen.getByText('three@example.com')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(<EmailList emails={emails} />);
    expect(screen.getByText('Recipient')).toBeInTheDocument();
    expect(screen.getByText('Subject')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Scheduled for')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
  });

  it('renders an empty table for no emails', () => {
    render(<EmailList emails={[]} />);
    expect(screen.getByText('Recipient')).toBeInTheDocument();
    expect(screen.getByText('Subject')).toBeInTheDocument();
  });

  it('renders a single email', () => {
    render(<EmailList emails={[emails[0]]} />);
    expect(screen.getByText('First subject')).toBeInTheDocument();
    expect(screen.getByText('one@example.com')).toBeInTheDocument();
  });

  it('renders error message for failed emails', () => {
    render(<EmailList emails={[emails[1]]} />);
    expect(screen.getByText('SMTP timeout')).toBeInTheDocument();
  });

  it('renders many emails', () => {
    const many: EmailRow[] = Array.from({ length: 30 }, (_, i) => ({
      id: `e-${i}`,
      subject: `Subject ${i}`,
      to_email: `user${i}@example.com`,
      status: 'SENT',
      scheduled_at: '2026-01-01T10:00:00Z',
      next_attempt_at: null,
      error_message: null,
      campaign: null,
      sent_at: '2026-01-01T10:05:00Z',
      created_at: '2026-01-01T09:00:00Z',
    }));
    render(<EmailList emails={many} />);
    expect(screen.getByText('Subject 0')).toBeInTheDocument();
    expect(screen.getByText('Subject 29')).toBeInTheDocument();
  });
});

describe('EmailList retry button', () => {
  const failedEmail: EmailRow = {
    id: 'job-1',
    to_email: 'user@example.com',
    subject: 'Welcome',
    status: 'FAILED',
    scheduled_at: '2026-09-15T10:00:00Z',
    next_attempt_at: null,
    error_message: 'SMTP authentication failed.',
    campaign: { timezone: 'UTC', name: 'Test campaign' },
    sent_at: null,
    created_at: '2026-09-15T09:00:00Z',
  };

  const sentEmail: EmailRow = {
    ...failedEmail,
    id: 'job-2',
    status: 'SENT',
    error_message: null,
    sent_at: '2026-09-15T10:01:00Z',
  };

  it('shows a Retry button for FAILED emails when onRetry is provided', () => {
    render(<EmailList emails={[failedEmail]} onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('does not show a Retry button for non-FAILED emails', () => {
    render(<EmailList emails={[sentEmail]} onRetry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('does not show a Retry button when onRetry is not provided', () => {
    render(<EmailList emails={[failedEmail]} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('calls onRetry with the email when clicked', () => {
    const onRetry = vi.fn();
    render(<EmailList emails={[failedEmail]} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith(failedEmail);
  });

  it('disables the retry button when retryingId matches', () => {
    render(<EmailList emails={[failedEmail]} onRetry={vi.fn()} retryingId={failedEmail.id} />);
    const button = screen.getByRole('button', { name: 'Retry' });
    expect(button).toBeDisabled();
  });

  it('disables the retry button when another email is retrying', () => {
    render(<EmailList emails={[failedEmail]} onRetry={vi.fn()} retryingId="other-job-id" />);
    const button = screen.getByRole('button', { name: 'Retry' });
    expect(button).toBeDisabled();
  });

  it('shows retry buttons for multiple FAILED emails', () => {
    const failed2 = { ...failedEmail, id: 'job-4' };
    render(<EmailList emails={[failedEmail, failed2]} onRetry={vi.fn()} />);
    const buttons = screen.getAllByRole('button', { name: 'Retry' });
    expect(buttons).toHaveLength(2);
  });
});

describe('EmailList cancel button', () => {
  const baseEmail: EmailRow = {
    id: 'job-10',
    to_email: 'user@example.com',
    subject: 'Welcome',
    status: 'SCHEDULED',
    scheduled_at: '2026-09-15T10:00:00Z',
    next_attempt_at: null,
    error_message: null,
    campaign: { timezone: 'UTC', name: 'Test campaign' },
    sent_at: null,
    created_at: '2026-09-15T09:00:00Z',
  };

  it('shows a Cancel button for SCHEDULED emails when onCancel is provided', () => {
    render(<EmailList emails={[baseEmail]} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('shows a Cancel button for QUEUED emails when onCancel is provided', () => {
    const queued = { ...baseEmail, id: 'job-11', status: 'QUEUED' };
    render(<EmailList emails={[queued]} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('shows a Cancel button for RETRY_WAIT emails when onCancel is provided', () => {
    const retryWait = {
      ...baseEmail,
      id: 'job-12',
      status: 'RETRY_WAIT',
      next_attempt_at: '2026-09-15T11:00:00Z',
    };
    render(<EmailList emails={[retryWait]} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('does not show a Cancel button for SENT emails', () => {
    const sent = { ...baseEmail, id: 'job-13', status: 'SENT', sent_at: '2026-09-15T10:01:00Z' };
    render(<EmailList emails={[sent]} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('does not show a Cancel button for FAILED emails', () => {
    const failed = { ...baseEmail, id: 'job-14', status: 'FAILED', error_message: 'SMTP timeout' };
    render(<EmailList emails={[failed]} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('does not show a Cancel button for CANCELLED emails', () => {
    const cancelled = { ...baseEmail, id: 'job-15', status: 'CANCELLED' };
    render(<EmailList emails={[cancelled]} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('does not show a Cancel button for DELIVERY_UNKNOWN emails', () => {
    const unknown = { ...baseEmail, id: 'job-16', status: 'DELIVERY_UNKNOWN' };
    render(<EmailList emails={[unknown]} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('does not show a Cancel button for PROCESSING emails', () => {
    const processing = { ...baseEmail, id: 'job-17', status: 'PROCESSING' };
    render(<EmailList emails={[processing]} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('does not show a Cancel button when onCancel is not provided', () => {
    render(<EmailList emails={[baseEmail]} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('calls onCancel with the email when clicked', () => {
    const onCancel = vi.fn();
    render(<EmailList emails={[baseEmail]} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledWith(baseEmail);
  });

  it('disables the cancel button when cancellingId matches', () => {
    render(<EmailList emails={[baseEmail]} onCancel={vi.fn()} cancellingId={baseEmail.id} />);
    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button).toBeDisabled();
  });

  it('disables the cancel button when another email is cancelling', () => {
    render(<EmailList emails={[baseEmail]} onCancel={vi.fn()} cancellingId="other-job-id" />);
    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button).toBeDisabled();
  });

  it('shows Cancel buttons for multiple cancellable emails', () => {
    const second = { ...baseEmail, id: 'job-18', status: 'QUEUED' };
    render(<EmailList emails={[baseEmail, second]} onCancel={vi.fn()} />);
    const buttons = screen.getAllByRole('button', { name: 'Cancel' });
    expect(buttons).toHaveLength(2);
  });

  it('shows both Retry and Cancel buttons for RETRY_WAIT emails', () => {
    const retryWait = {
      ...baseEmail,
      id: 'job-19',
      status: 'RETRY_WAIT',
      next_attempt_at: '2026-09-15T11:00:00Z',
      error_message: 'Transient error',
    };
    render(<EmailList emails={[retryWait]} onRetry={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
