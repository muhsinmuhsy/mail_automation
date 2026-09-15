import { render, screen } from '@testing-library/react';
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
});
