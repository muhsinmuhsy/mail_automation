import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AttachmentsPage from '@/app/(dashboard)/attachments/page';

afterEach(() => vi.unstubAllGlobals());

const mockPagination = (total: number, page: number, pageSize = 20) => ({
  total,
  page,
  pageSize,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

const mockAttachment = (id: string, filename: string, sizeBytes = 1024, isDefault = false) => ({
  id,
  filename,
  size_bytes: sizeBytes,
  is_default: isDefault,
});

describe('AttachmentsPage loading', () => {
  it('shows a loader while fetching attachments', async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal('fetch', fetchMock);

    render(<AttachmentsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('No attachments uploaded yet')).not.toBeInTheDocument();

    resolveFetch({
      ok: true,
      json: async () => ({ data: [], pagination: mockPagination(0, 1) }),
    } as Response);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('No attachments uploaded yet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows attachments after loading completes with data', async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal('fetch', fetchMock);

    render(<AttachmentsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toBeInTheDocument();

    resolveFetch({
      ok: true,
      json: async () => ({
        data: [mockAttachment('1', 'cv.pdf')],
        pagination: mockPagination(1, 1),
      }),
    } as Response);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('cv.pdf')).toBeInTheDocument();
    expect(screen.queryByText('No attachments uploaded yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('AttachmentsPage uploads', () => {
  it.each(['api', 'network'])('displays %s failures and lets the user retry', async (failure) => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [], pagination: mockPagination(0, 1) }) });
    if (failure === 'api') {
      fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, error: { message: 'Attachment must be a valid PDF file.' } }) });
    } else {
      fetchMock.mockRejectedValueOnce(new Error('Network unavailable.'));
    }
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: mockAttachment('attachment-1', 'cv.pdf', 100), pagination: mockPagination(1, 1) }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [mockAttachment('attachment-1', 'cv.pdf', 100)], pagination: mockPagination(1, 1) }) });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const { container } = render(<AttachmentsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Upload Attachment' }));
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

describe('AttachmentsPage pagination', () => {
  it('shows the total attachment count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [mockAttachment('1', 'cv.pdf')],
        pagination: mockPagination(25, 1),
      }),
    }));
    render(<AttachmentsPage />);
    await waitFor(() => expect(screen.getByText('25 attachments')).toBeInTheDocument());
  });

  it('uses the singular "attachment" when there is exactly one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [mockAttachment('1', 'cv.pdf')],
        pagination: mockPagination(1, 1),
      }),
    }));
    render(<AttachmentsPage />);
    await waitFor(() => expect(screen.getByText('1 attachment')).toBeInTheDocument());
  });

  it('does not render pagination controls when there is only one page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [mockAttachment('1', 'cv.pdf')],
        pagination: mockPagination(1, 1),
      }),
    }));
    render(<AttachmentsPage />);
    await waitFor(() => expect(screen.getByText('cv.pdf')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('renders pagination controls when there are multiple pages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [mockAttachment('1', 'cv.pdf')],
        pagination: mockPagination(25, 1),
      }),
    }));
    render(<AttachmentsPage />);
    await waitFor(() => expect(screen.getByText('cv.pdf')).toBeInTheDocument());
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('fetches the next page when Next is clicked', async () => {
    const fetchMock = vi.fn();
    const page1 = Array.from({ length: 20 }, (_, i) => mockAttachment(`p1-${i}`, `page1-${i}.pdf`));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: page1, pagination: mockPagination(25, 1) }),
    });
    const page2 = Array.from({ length: 5 }, (_, i) => mockAttachment(`p2-${i}`, `page2-${i}.pdf`));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: page2, pagination: mockPagination(25, 2) }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<AttachmentsPage />);
    await waitFor(() => expect(screen.getByText('page1-0.pdf')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/attachments?page=2&limit=20&sortOrder=desc'));
    await waitFor(() => expect(screen.getByText('page2-0.pdf')).toBeInTheDocument());
    expect(screen.queryByText('page1-0.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('fetches the previous page when Previous is clicked', async () => {
    const fetchMock = vi.fn();
    const page1 = Array.from({ length: 20 }, (_, i) => mockAttachment(`p1-${i}`, `page1-${i}.pdf`));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: page1, pagination: mockPagination(25, 1) }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [mockAttachment('p2-0', 'page2-0.pdf')], pagination: mockPagination(25, 2) }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [mockAttachment('p1-0', 'page1-0.pdf')], pagination: mockPagination(25, 1) }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<AttachmentsPage />);
    await waitFor(() => expect(screen.getByText('page1-0.pdf')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText('page2-0.pdf')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/attachments?page=1&limit=20&sortOrder=desc'));
    await waitFor(() => expect(screen.getByText('page1-0.pdf')).toBeInTheDocument());
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });
});
