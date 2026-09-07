import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContactsPage from '@/app/(dashboard)/contacts/page';

const mockContact = (id: string, name: string, email: string, company?: string) => ({
  id,
  name,
  email,
  company,
});

describe('ContactsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state while fetching', () => {
    let resolveFetch: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(<ContactsPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('No contacts yet')).not.toBeInTheDocument();

    resolveFetch!({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as Response);
  });

  it('loads contacts on mount', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [mockContact('c1', 'Alice', 'alice@example.com', 'Acme')],
      }),
    } as Response);

    render(<ContactsPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/contacts'));
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('shows empty state when there are no contacts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as Response);

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

  it('submits the contact form and adds the new contact to the list', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [mockContact('c1', 'Existing', 'existing@example.com')],
      }),
    } as Response);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockContact('c2', 'New Contact', 'new@example.com', 'NewCo'),
      }),
    } as Response);

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Existing')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await user.type(screen.getByLabelText('Name'), 'New Contact');
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Company'), 'NewCo');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/contacts',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'New Contact', email: 'new@example.com', company: 'NewCo' }),
        })
      )
    );

    expect(screen.getByText('New Contact')).toBeInTheDocument();
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
  });

  it('shows an error when saving a contact fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Save failed' }),
      } as Response);

    render(<ContactsPage />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    await user.type(screen.getByLabelText('Name'), 'Bad Contact');
    await user.type(screen.getByLabelText('Email'), 'bad@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Save failed')
    );
  });

  it('renders a delete button for each contact', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          mockContact('c1', 'Alice', 'alice@example.com'),
          mockContact('c2', 'Bob', 'bob@example.com'),
        ],
      }),
    } as Response);

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Delete Alice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Bob' })).toBeInTheDocument();
  });

  it('deletes a contact when confirmed and removes it from the list', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          mockContact('c1', 'Alice', 'alice@example.com'),
          mockContact('c2', 'Bob', 'bob@example.com'),
        ],
      }),
    } as Response);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: null }),
    } as Response);

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByText('Bob')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Alice' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/contacts/c1', expect.objectContaining({ method: 'DELETE' }))
    );

    await waitFor(() => expect(screen.queryByText('Alice')).not.toBeInTheDocument());
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows an error when deleting a contact fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockContact('c1', 'Alice', 'alice@example.com')],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'Delete failed' }),
      } as Response);

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Alice' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Delete failed')
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('does not call the API when the delete dialog is cancelled', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [mockContact('c1', 'Alice', 'alice@example.com')],
      }),
    } as Response);

    render(<ContactsPage />);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Alice' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });
});
