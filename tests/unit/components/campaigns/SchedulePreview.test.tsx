import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { SchedulePreview } from '@/components/campaigns/SchedulePreview';

const props = { startAt: '2030-01-01T09:00', timezone: 'UTC', intervalMinutes: '5', dailyLimit: '20', count: 50 };
describe('sending preview', () => {
  it('shows a single scheduled email without pace or cap even if hidden inputs are invalid', () => {
    render(<SchedulePreview {...props} count={1} intervalMinutes="0" dailyLimit="-1" />);
    expect(screen.getByText(/1 email will be scheduled for/)).toBeInTheDocument();
    expect(screen.queryByText(/daily cap|daily batch|every/)).not.toBeInTheDocument();
  });
  it('explains spacing and batches and shows the next batch and final email', () => {
    render(<SchedulePreview {...props} />);
    expect(screen.getByText(/Send 1 email every 5 minutes/)).toHaveTextContent('up to 20');
    expect(screen.getByText('Next batch starts')).toBeInTheDocument();
    expect(screen.getByText('Last email (50)')).toBeInTheDocument();
    expect(screen.getByText(/Account limits, retries/)).toBeInTheDocument();
  });
  it('updates when the user changes the interval or removes the cap', () => {
    const view = render(<SchedulePreview {...props} />);
    view.rerender(<SchedulePreview {...props} intervalMinutes="10" dailyLimit="" />);
    expect(screen.getByText(/Send 1 email every 10 minutes/)).toHaveTextContent('no daily cap');
    expect(screen.queryByText('Next batch starts')).not.toBeInTheDocument();
  });
  it('handles unfinished input without crashing or showing misleading times', () => {
    render(<SchedulePreview {...props} timezone="invalid" />);
    expect(screen.getByText(/Enter a valid start time/)).toBeInTheDocument();
    expect(screen.queryByText('Email 1')).not.toBeInTheDocument();
  });
  it('shows Updating… spinner when loading prop is true', () => {
    render(<SchedulePreview {...props} loading />);
    expect(screen.getByText('Updating…')).toBeInTheDocument();
    expect(screen.queryByText(/Send 1 email/)).not.toBeInTheDocument();
    expect(screen.queryByText(/recipients/)).not.toBeInTheDocument();
  });
  it('shows recipient email next to each Email N when recipients prop is provided', () => {
    render(<SchedulePreview {...props} count={2} recipients={[
      { name: 'Ada Lovelace', email: 'ada@example.com' },
      { name: 'Grace Hopper', email: 'grace@example.com' },
    ]} />);
    expect(screen.getByText(/Email 1/)).toHaveTextContent('Ada Lovelace <ada@example.com>');
    expect(screen.getByText(/Email 2/)).toHaveTextContent('Grace Hopper <grace@example.com>');
  });
  it('shows recipient email in single email mode', () => {
    render(<SchedulePreview {...props} count={1} recipients={[
      { name: 'Ada Lovelace', email: 'ada@example.com' },
    ]} />);
    expect(screen.getByText(/Recipient: Ada Lovelace/)).toBeInTheDocument();
  });
  it('shows See more button with remaining count when emails exceed page size', () => {
    render(<SchedulePreview {...props} count={25} dailyLimit="" />);
    expect(screen.getByText(/See more \(15 remaining\)/)).toBeInTheDocument();
    expect(screen.getByText('Last email (25)')).toBeInTheDocument();
  });
  it('loads 10 more rows on See more click', async () => {
    const user = userEvent.setup();
    render(<SchedulePreview {...props} count={25} dailyLimit="" />);
    expect(screen.getByText('Email 10')).toBeInTheDocument();
    expect(screen.queryByText('Email 11')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /See more/ }));
    expect(screen.getByText('Email 11')).toBeInTheDocument();
    expect(screen.getByText('Email 20')).toBeInTheDocument();
    expect(screen.getByText(/See more \(5 remaining\)/)).toBeInTheDocument();
  });
  it('hides See more button when all emails are visible', async () => {
    const user = userEvent.setup();
    render(<SchedulePreview {...props} count={15} dailyLimit="" />);
    expect(screen.getByRole('button', { name: /See more/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /See more/ }));
    expect(screen.queryByRole('button', { name: /See more/ })).not.toBeInTheDocument();
    expect(screen.getByText('Email 15')).toBeInTheDocument();
    expect(screen.queryByText(/Last email/)).not.toBeInTheDocument();
  });
  it('does not show See more when count is within page size', () => {
    render(<SchedulePreview {...props} count={10} dailyLimit="" />);
    expect(screen.queryByRole('button', { name: /See more/ })).not.toBeInTheDocument();
    expect(screen.getByText('Email 10')).toBeInTheDocument();
  });
});
