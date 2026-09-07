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
    await user.type(screen.getByLabelText('Campaign name'), 'Fast campaign');
    expect(screen.queryByText('Loading campaign options...')).not.toBeInTheDocument();
    expect(screen.queryByText('Refresh available options')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('status', { name: 'Preparing campaign choices' })).toBeInTheDocument();
    await act(async () => { finish({ success: true, data: options }); });
    expect(await screen.findByLabelText('Sending account')).toHaveValue('account');
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/campaigns/options')).toHaveLength(1);
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/campaigns/options')).toHaveLength(2);
    view.unmount();
    vi.unstubAllGlobals();
  });
});
