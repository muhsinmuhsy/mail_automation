import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const router = { push: vi.fn() };
const params = { id: 'c1' };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => params,
}));

import CampaignDetailPage from '@/app/(dashboard)/campaigns/[id]/page';

const mockCampaign = (overrides: Partial<{
  name: string;
  status: string;
  start_at: string;
  timezone: string;
  interval_minutes: number;
  daily_limit: number | null;
  created_at: string;
  _count: { email_jobs: number };
  email_jobs: Array<{
    id: string;
    to_email: string;
    status: string;
    scheduled_at: string;
    sent_at: string | null;
    error_message: string | null;
    next_attempt_at: string | null;
  }>;
  usageToday: { sent: number; reserved: number; limit: number | null };
}> = {}) => ({
  name: 'Q3 Outreach',
  status: 'ACTIVE',
  start_at: '2026-09-06T06:21:00Z',
  timezone: 'Asia/Calcutta',
  interval_minutes: 5,
  daily_limit: 20,
  created_at: '2026-08-01T10:00:00Z',
  _count: { email_jobs: 2 },
  email_jobs: [
    { id: 'j1', to_email: 'alice@example.com', status: 'SENT', scheduled_at: '2026-09-06T06:21:00Z', sent_at: '2026-09-06T06:21:05Z', error_message: null, next_attempt_at: null },
    { id: 'j2', to_email: 'bob@example.com', status: 'SCHEDULED', scheduled_at: '2026-09-06T06:26:00Z', sent_at: null, error_message: null, next_attempt_at: null },
  ],
  ...overrides,
});

const mockCampaignResponse = (campaign: ReturnType<typeof mockCampaign>) => ({
  ok: true,
  json: async () => ({ success: true, data: campaign }),
}) as Response;

/** Returns the <dd> value element paired with the given <dt> label. */
function valueForLabel(label: string): HTMLElement {
  const dt = screen.getByText(label);
  return dt.parentElement!.querySelector('dd')!;
}

describe('CampaignDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state while fetching', async () => {
    let resolveFetch!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );

    render(<CampaignDetailPage />);

    await waitFor(() => expect(resolveFetch).toBeDefined());
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('fetches campaign details on mount', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(mockCampaignResponse(mockCampaign()));

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/campaigns/c1',
        expect.objectContaining({ credentials: 'include' })
      )
    );
  });

  it('displays the campaign name, status, start time and recipients', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockCampaignResponse(mockCampaign()));

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Q3 Outreach', level: 1 })).toBeInTheDocument()
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(valueForLabel('Start time:')).toHaveTextContent(/Asia\/Calcutta/);
    expect(valueForLabel('Recipients:')).toHaveTextContent('2');
  });

  it('shows the delivery progress table with email jobs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockCampaignResponse(mockCampaign()));

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Delivery progress', level: 3 })).toBeInTheDocument()
    );
    expect(screen.getByText(/Showing 2 of 2 emails/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Recipient' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Scheduled for' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Sent' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('navigates back to /campaigns when Back is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockCampaignResponse(mockCampaign()));

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Q3 Outreach', level: 1 })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(router.push).toHaveBeenCalledWith('/campaigns');
  });

  it('shows an error when the campaign fails to load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, error: { message: 'Campaign not found.' } }),
    } as Response);

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Campaign not found.')
    );
  });

  it('shows an error when the response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ success: true, data: mockCampaign() }),
    } as Response);

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load campaign details.')
    );
  });

  it('hides interval and daily limit for a single-recipient campaign', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockCampaignResponse(
        mockCampaign({
          _count: { email_jobs: 1 },
          email_jobs: [
            { id: 'j1', to_email: 'alice@example.com', status: 'SCHEDULED', scheduled_at: '2026-09-06T06:21:00Z', sent_at: null, error_message: null, next_attempt_at: null },
          ],
        })
      )
    );

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Q3 Outreach', level: 1 })).toBeInTheDocument()
    );
    expect(screen.queryByText('Time between emails:')).not.toBeInTheDocument();
    expect(screen.queryByText('Emails per day:')).not.toBeInTheDocument();
    expect(valueForLabel('Recipients:')).toHaveTextContent('1');
  });

  it('shows No campaign limit when daily limit is null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockCampaignResponse(mockCampaign({ daily_limit: null }))
    );

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Q3 Outreach', level: 1 })).toBeInTheDocument()
    );
    expect(valueForLabel('Emails per day:')).toHaveTextContent('No campaign limit');
  });

  it('shows campaign daily usage progress when usageToday has a limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockCampaignResponse({
        ...mockCampaign(),
        usageToday: { sent: 12, reserved: 3, limit: 20 },
      })
    );

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(screen.getByText('Campaign daily usage')).toBeInTheDocument()
    );
    expect(screen.getByText(/of 20/)).toBeInTheDocument();
    expect(screen.getByText(/5 remaining/)).toBeInTheDocument();
  });

  it('hides usage progress when campaign has no daily limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockCampaignResponse({
        ...mockCampaign({ daily_limit: null }),
        usageToday: { sent: 5, reserved: 0, limit: null },
      })
    );

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Q3 Outreach', level: 1 })).toBeInTheDocument()
    );
    expect(screen.queryByText('Campaign daily usage')).not.toBeInTheDocument();
  });

  it('shows Retry button for FAILED and RETRY_WAIT rows, em-dash for others', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockCampaignResponse(
        mockCampaign({
          email_jobs: [
            { id: 'j1', to_email: 'alice@example.com', status: 'SENT', scheduled_at: '2026-09-06T06:21:00Z', sent_at: '2026-09-06T06:21:05Z', error_message: null, next_attempt_at: null },
            { id: 'j2', to_email: 'bob@example.com', status: 'FAILED', scheduled_at: '2026-09-06T06:26:00Z', sent_at: null, error_message: 'SMTP auth failed', next_attempt_at: null },
            { id: 'j3', to_email: 'carol@example.com', status: 'RETRY_WAIT', scheduled_at: '2026-09-06T06:31:00Z', sent_at: null, error_message: null, next_attempt_at: '2026-09-06T07:00:00Z' },
          ],
        })
      )
    );

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(screen.getByText('bob@example.com')).toBeInTheDocument()
    );
    const retryButtons = screen.getAllByRole('button', { name: 'Retry' });
    expect(retryButtons).toHaveLength(2);
  });

  it('shows error_message under status for FAILED rows', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockCampaignResponse(
        mockCampaign({
          email_jobs: [
            { id: 'j1', to_email: 'bob@example.com', status: 'FAILED', scheduled_at: '2026-09-06T06:26:00Z', sent_at: null, error_message: 'Connection refused', next_attempt_at: null },
          ],
        })
      )
    );

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(screen.getByText('Connection refused')).toBeInTheDocument()
    );
  });

  it('calls the retry API when per-row Retry is clicked', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      mockCampaignResponse(
        mockCampaign({
          email_jobs: [
            { id: 'j1', to_email: 'bob@example.com', status: 'FAILED', scheduled_at: '2026-09-06T06:26:00Z', sent_at: null, error_message: 'SMTP error', next_attempt_at: null },
          ],
        })
      )
    );
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: 'Email queued for retry.' }),
    } as Response);
    fetchMock.mockResolvedValueOnce(
      mockCampaignResponse(
        mockCampaign({
          email_jobs: [
            { id: 'j1', to_email: 'bob@example.com', status: 'SCHEDULED', scheduled_at: '2026-09-06T06:26:00Z', sent_at: null, error_message: null, next_attempt_at: null },
          ],
        })
      )
    );

    render(<CampaignDetailPage />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/emails/j1/retry', expect.objectContaining({ method: 'POST' }))
    );
  });
});
