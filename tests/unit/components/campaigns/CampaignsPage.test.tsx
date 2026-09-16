import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import CampaignsPage from '@/app/(dashboard)/campaigns/page';

const router = { replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

describe('campaign option loading', () => {
  it('preloads one request, opens the name immediately, and refreshes on return without a manual button', async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    const options = { emailAccounts: [{ id: 'account', label: 'me@gmail.com', provider: 'gmail' }], attachments: [], templates: [{ id: 'template', label: 'Hello' }], contacts: [] };
    const fetcher = vi.fn(async (url: string) => ({ status: 200, json: async () => url === '/api/campaigns/options' ? pending : { success: true, data: [] } }));
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    const view = render(<CampaignsPage />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/campaigns/options', expect.anything()));
    await user.click(screen.getAllByRole('button', { name: 'Create campaign' })[0]);
    await user.type(screen.getByLabelText(/Campaign name/), 'Fast campaign');
    expect(screen.queryByText('Loading campaign options...')).not.toBeInTheDocument();
    expect(screen.queryByText('Refresh available options')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('status', { name: 'Preparing campaign choices' })).toBeInTheDocument();
    await act(async () => { finish({ success: true, data: options }); });
    expect(await screen.findByRole('combobox', { name: 'Sending account' })).toHaveTextContent('me@gmail.com');
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/campaigns/options')).toHaveLength(1);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/campaigns/options')).toHaveLength(2);
    view.unmount();
    vi.unstubAllGlobals();
  });
});

describe('CampaignsPage real-time refresh', () => {
  it('reloads the list immediately after a pause action', async () => {
    const fetchMock = vi.fn();

    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, data: { emailAccounts: [], attachments: [], templates: [], contacts: [] } }),
    });
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, data: [{ id: 'c1', name: 'Test Campaign', status: 'ACTIVE', total_emails: 10, sent: 5, failed: 0, created_at: '2026-09-01T00:00:00Z' }] }),
    });
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, data: null, message: 'Campaign paused.' }),
    });
    fetchMock.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ success: true, data: [{ id: 'c1', name: 'Test Campaign', status: 'PAUSED', total_emails: 10, sent: 5, failed: 0, created_at: '2026-09-01T00:00:00Z' }] }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<CampaignsPage />);

    await waitFor(() => expect(screen.getByText('Test Campaign')).toBeInTheDocument(), { timeout: 5000 });

    await user.click(screen.getByRole('button', { name: 'Pause' }));

    await waitFor(() => expect(fetchMock.mock.calls.some(c => c[0] === '/api/campaigns/c1/pause')).toBe(true), { timeout: 5000 });
    const reloadCall = fetchMock.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/api/campaigns?page=1')
    );
    expect(reloadCall).toBeDefined();

    vi.unstubAllGlobals();
  });
});
