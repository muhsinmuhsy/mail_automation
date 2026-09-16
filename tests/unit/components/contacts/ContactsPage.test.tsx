import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const router = { push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import ContactsPage from '@/app/(dashboard)/contacts/page';

const mockContact = (id: string, name: string, email: string) => ({
  id,
  name,
  email,
});

const mockPagination = (total: number, page: number, pageSize = 20) => ({
  total,
  page,
  pageSize,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

const mockListResponse = (contacts: ReturnType<typeof mockContact>[], total?: number) => ({
  ok: true,
  json: async () => ({
    success: true,
    data: contacts,
    pagination: mockPagination(total ?? contacts.length, 1),
  }),
}) as Response;

const mockFieldsResponse = () => ({
  ok: true,
  json: async () => ({ success: true, data: [] }),
}) as Response;

describe('ContactsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state while fetching', async () => {
    let resolveFetch!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(<ContactsPage />);

    await waitFor(() => expect(resolveFetch).toBeDefined());

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('No contacts yet')).not.toBeInTheDocument();

    resolveFetch({
      ok: true,
      json: async () => ({ success: true, data: [], pagination: mockPagination(0, 1) }),
    } as Response);
  });

  it('loads contacts on mount with pagination params', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockListResponse([mockContact('c1', 'Alice', 'alice@example.com')])
    );

    render(<ContactsPage />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/contacts?page=1&limit=20&sortOrder=desc')
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('shows empty state when there are no contacts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockListResponse([]));

    render(<ContactsPage />);

    await waitFor(() =>
      expect(screen.getByText('No contacts yet')).toBeInTheDocument()
    );
  });

  it('shows an error when loading fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Network error' }),
    } as Response);

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network error'));
  });

  it('submits the contact form and reloads the list', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      mockListResponse([mockContact('c1', 'Existing', 'existing@example.com')])
    );

    fetchMock.mockResolvedValueOnce(mockFieldsResponse());

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockContact('c2', 'New Contact', 'new@example.com'),
      }),
    } as Response);

    fetchMock.mockResolvedValueOnce(
      mockListResponse(
        [mockContact('c2', 'New Contact', 'new@example.com'),
         mockContact('c1', 'Existing', 'existing@example.com')],
        2
      )
    );

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Existing')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await user.type(screen.getByLabelText('Name'), 'New Contact');
    await user.type(screen.getByLabelText(/Email/), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/contacts',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'new@example.com', name: 'New Contact' }),
        })
      )
    );

    await waitFor(() => expect(screen.getByText('New Contact')).toBeInTheDocument());
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
  });

  it('renders custom field inputs and includes their values in the submit body', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(mockListResponse([]));

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { id: 'f1', name: 't_shirt_size', label: 'T-shirt size', field_type: 'text', is_required: false },
        ],
      }),
    } as Response);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockContact('c2', 'Jane', 'jane@example.com') }),
    } as Response);

    fetchMock.mockResolvedValueOnce(mockListResponse([mockContact('c2', 'Jane', 'jane@example.com')]));

    render(<ContactsPage />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await waitFor(() => expect(screen.getByLabelText('T-shirt size')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Name'), 'Jane');
    await user.type(screen.getByLabelText(/Email/), 'jane@example.com');
    await user.type(screen.getByLabelText('T-shirt size'), 'M');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/contacts',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'jane@example.com', name: 'Jane', t_shirt_size: 'M' }),
        })
      )
    );
  });

  it('shows an error when saving a contact fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockListResponse([]))
      .mockResolvedValueOnce(mockFieldsResponse())
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Save failed' }),
      } as Response);

    render(<ContactsPage />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await user.type(screen.getByLabelText('Name'), 'Bad Contact');
    await user.type(screen.getByLabelText(/Email/), 'bad@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Save failed')
    );
  });

  it('renders a delete button for each contact', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockListResponse([
        mockContact('c1', 'Alice', 'alice@example.com'),
        mockContact('c2', 'Bob', 'bob@example.com'),
      ])
    );

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    expect(deleteButtons).toHaveLength(2);
  });

  it('opens a confirmation dialog when delete is clicked and deletes on confirm', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      mockListResponse([
        mockContact('c1', 'Alice', 'alice@example.com'),
        mockContact('c2', 'Bob', 'bob@example.com'),
      ], 2)
    );

    fetchMock.mockResolvedValueOnce(mockFieldsResponse());

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: null }),
    } as Response);

    fetchMock.mockResolvedValueOnce(
      mockListResponse([mockContact('c2', 'Bob', 'bob@example.com')], 1)
    );

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByText('Bob')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    const dialog = screen.getByText('Delete contact').parentElement!;
    expect(
      within(dialog).getByText(/Are you sure you want to delete Alice\?/)
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/contacts/c1', expect.objectContaining({ method: 'DELETE' }))
    );

    await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows an error when deleting a contact fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockListResponse([mockContact('c1', 'Alice', 'alice@example.com')], 1)
      )
      .mockResolvedValueOnce(mockFieldsResponse())
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Delete failed' }),
      } as Response);

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByText('Delete contact').parentElement!;
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Delete failed')
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('does not call the API when the delete dialog is cancelled', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockListResponse([mockContact('c1', 'Alice', 'alice@example.com')], 1)
    );

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByText('Delete contact').parentElement!;
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('reloads the list with a fetch call after delete (real-time refresh)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      mockListResponse([mockContact('c1', 'Alice', 'alice@example.com')], 1)
    );
    fetchMock.mockResolvedValueOnce(mockFieldsResponse());
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: null }),
    } as Response);
    fetchMock.mockResolvedValueOnce(mockListResponse([], 0));

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByText('Delete contact').parentElement!;
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('No contacts yet')).toBeInTheDocument());
    const reloadCall = fetchMock.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/api/contacts?page=1') && !call[1]?.method
    );
    expect(reloadCall).toBeDefined();
  });

  describe('pagination', () => {
    it('shows the total contact count', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockListResponse([mockContact('c1', 'Alice', 'alice@example.com')], 25)
      );

      render(<ContactsPage />);

      await waitFor(() => expect(screen.getByText('25 contacts')).toBeInTheDocument());
    });

    it('uses the singular "contact" when there is exactly one', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockListResponse([mockContact('c1', 'Alice', 'alice@example.com')], 1)
      );

      render(<ContactsPage />);

      await waitFor(() => expect(screen.getByText('1 contact')).toBeInTheDocument());
    });

    it('does not render pagination controls when there is only one page', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockListResponse([mockContact('c1', 'Alice', 'alice@example.com')], 1)
      );

      render(<ContactsPage />);

      await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });

    it('renders pagination controls when there are multiple pages', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockListResponse([mockContact('c1', 'Alice', 'alice@example.com')], 25)
      );

      render(<ContactsPage />);

      await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    });

    it('fetches the next page when Next is clicked', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.spyOn(globalThis, 'fetch');

      const page1Contacts = Array.from({ length: 20 }, (_, i) =>
        mockContact(`p1-${i}`, `Page1 ${i}`, `p1${i}@example.com`)
      );

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: page1Contacts,
          pagination: mockPagination(25, 1),
        }),
      } as Response);

      fetchMock.mockResolvedValueOnce(mockFieldsResponse());

      const page2Contacts = Array.from({ length: 5 }, (_, i) =>
        mockContact(`p2-${i}`, `Page2 ${i}`, `p2${i}@example.com`)
      );

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: page2Contacts,
          pagination: mockPagination(25, 2),
        }),
      } as Response);

      render(<ContactsPage />);

      await waitFor(() => expect(screen.getByText('Page1 0')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Next' }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith('/api/contacts?page=2&limit=20&sortOrder=desc')
      );
      await waitFor(() => expect(screen.getByText('Page2 0')).toBeInTheDocument());
      expect(screen.queryByText('Page1 0')).not.toBeInTheDocument();
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    });

    it('fetches the previous page when Previous is clicked', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.spyOn(globalThis, 'fetch');

      const page1Contacts = Array.from({ length: 20 }, (_, i) =>
        mockContact(`p1-${i}`, `Page1 ${i}`, `p1${i}@example.com`)
      );

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: page1Contacts,
          pagination: mockPagination(25, 1),
        }),
      } as Response);

      fetchMock.mockResolvedValueOnce(mockFieldsResponse());

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockContact('p2-0', 'Page2 Contact', 'p2@example.com')],
          pagination: mockPagination(25, 2),
        }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockContact('p1-0', 'Page1 Contact', 'p1@example.com')],
          pagination: mockPagination(25, 1),
        }),
      } as Response);

      render(<ContactsPage />);

      await waitFor(() => expect(screen.getByText('Page1 0')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(screen.getByText('Page2 Contact')).toBeInTheDocument());
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Previous' }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith('/api/contacts?page=1&limit=20&sortOrder=desc')
      );
      await waitFor(() => expect(screen.getByText('Page1 Contact')).toBeInTheDocument());
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
  });
});
