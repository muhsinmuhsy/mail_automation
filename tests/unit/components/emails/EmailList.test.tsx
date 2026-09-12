import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('To')).toBeInTheDocument();
    expect(screen.getByText('Subject')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Scheduled for')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
  });

  it('renders an empty table for no emails', () => {
    render(<EmailList emails={[]} />);
    expect(screen.getByText('To')).toBeInTheDocument();
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
