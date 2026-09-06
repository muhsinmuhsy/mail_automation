import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import EmailsPage from '@/app/(dashboard)/emails/page';
const router = { replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Emails schedule table', () => {
  it('displays the scheduled time and refreshes pending email status', async () => {
    vi.useFakeTimers();
    const row = { id: 'j1', to_email: 'recipient@example.com', subject: 'ww', status: 'SCHEDULED',
      created_at: '2026-09-06T06:19:40Z', scheduled_at: '2026-09-06T06:21:00Z', sent_at: null,
      campaign: { timezone: 'Asia/Calcutta', name: 'Test' } };
    const fetch = vi.fn().mockImplementation(async () => ({ status: 200, json: async () => ({ success: true, data: [{ ...row }] }) }));
    vi.stubGlobal('fetch', fetch);
    render(<EmailsPage />);
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByRole('columnheader', { name: 'Scheduled for' })).toBeInTheDocument();
    expect(screen.getByText(/Asia\/Calcutta/)).toBeInTheDocument();
    expect(screen.getByText('Scheduled', { selector: 'span' })).toBeInTheDocument();
    row.status = 'SENT';
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(screen.queryByText('Scheduled', { selector: 'span' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    cleanup();
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
