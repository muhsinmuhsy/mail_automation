import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AttachmentsPage from '@/app/(dashboard)/attachments/page';

afterEach(() => vi.unstubAllGlobals());

describe('AttachmentsPage uploads', () => {
  it.each(['api', 'network'])('displays %s failures and lets the user retry', async (failure) => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    if (failure === 'api') {
      fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, error: { message: 'Attachment must be a valid PDF file.' } }) });
    } else {
      fetchMock.mockRejectedValueOnce(new Error('Network unavailable.'));
    }
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: 'resume-1', filename: 'cv.pdf', size_bytes: 100, is_default: false } }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { container } = render(<AttachmentsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const file = new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' });
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file);
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(failure === 'api' ? 'Attachment must be a valid PDF file.' : 'Network unavailable.');
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByText('cv.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe('/api/attachments');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(fetchMock.mock.calls[1][1].body.get('file')).toBe(file);
  });
});
