import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignDetails } from '@/components/campaigns/CampaignDetails';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CampaignDetails', () => {
  it('shows the saved schedule, recipients, progress and closes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {
      name: 'Test campaign', start_at: '2026-09-06T06:21:00Z', timezone: 'Asia/Calcutta',
      interval_minutes: 5, daily_limit: 20, _count: { email_jobs: 1 },
      email_jobs: [{ id: 'j1', to_email: 'recipient@example.com', status: 'SCHEDULED', scheduled_at: '2026-09-06T06:21:00Z', sent_at: null }],
    } }) }));
    const close = vi.fn();
    render(<CampaignDetails campaignId="c1" onClose={close} />);
    expect(await screen.findByText('recipient@example.com')).toBeInTheDocument();
    expect(screen.getAllByText(/Asia\/Calcutta/)).toHaveLength(2);
    expect(screen.queryByText('Every 5 minutes')).not.toBeInTheDocument();
    expect(screen.queryByText('Emails per day')).not.toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('shows API errors rather than an empty schedule', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, error: { message: 'Campaign not found.' } }) }));
    render(<CampaignDetails campaignId="missing" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Campaign not found.'));
  });
});
