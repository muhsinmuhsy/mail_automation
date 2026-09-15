import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const router = { push: vi.fn() };
const params = { id: 'c1' };
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => params,
}));

import ContactEditPage from '@/app/(dashboard)/contacts/[id]/edit/page';

const mockContact = (overrides: Partial<{
  id: string;
  name: string;
  email: string;
  created_at: string;
  custom_fields: Record<string, string | null>;
}> = {}) => ({
  id: 'c1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  ...overrides,
});

const mockContactResponse = (contact: ReturnType<typeof mockContact>) => ({
  ok: true,
  json: async () => ({ data: contact }),
}) as Response;

const mockFieldsResponse = (
  fields: Array<{ id: string; name: string; label: string; field_type: string; is_required: boolean }> = []
) => ({
  ok: true,
  json: async () => ({ success: true, data: fields }),
}) as Response;

describe('ContactEditPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state while fetching', async () => {
    let resolveFetch!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );

    render(<ContactEditPage />);

    await waitFor(() => expect(resolveFetch).toBeDefined());
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('fetches the contact and field definitions on mount', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(mockContactResponse(mockContact()));
    fetchMock.mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactEditPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/contacts/c1'));
    expect(fetchMock).toHaveBeenCalledWith('/api/contact-fields');
  });

  it('pre-fills the form with the contact values', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockContactResponse(mockContact({ name: 'Jane Doe', email: 'jane@example.com' }))
      )
      .mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactEditPage />);

    await waitFor(() => expect(screen.getByLabelText('Name')).toBeInTheDocument());
    expect(screen.getByLabelText('Name')).toHaveValue('Jane Doe');
    expect(screen.getByLabelText(/Email/)).toHaveValue('jane@example.com');
  });

  it('shows custom field inputs in the form pre-filled with their values', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockContactResponse(mockContact({ custom_fields: { t_shirt_size: 'M' } }))
      )
      .mockResolvedValueOnce(
        mockFieldsResponse([
          { id: 'f1', name: 't_shirt_size', label: 'T-shirt size', field_type: 'text', is_required: false },
        ])
      );

    render(<ContactEditPage />);

    await waitFor(() => expect(screen.getByLabelText('T-shirt size')).toBeInTheDocument());
    expect(screen.getByLabelText('T-shirt size')).toHaveValue('M');
  });

  it('navigates back to /contacts/c1 when Cancel is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockContactResponse(mockContact()))
      .mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactEditPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.push).toHaveBeenCalledWith('/contacts/c1');
  });

  it('saves the contact via PATCH and navigates to /contacts/c1', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const contact = mockContact({ name: 'Jane Doe', email: 'jane@example.com' });

    // initial mount: contact + fields
    fetchMock.mockResolvedValueOnce(mockContactResponse(contact));
    fetchMock.mockResolvedValueOnce(mockFieldsResponse());
    // PATCH response
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

    render(<ContactEditPage />);

    await waitFor(() => expect(screen.getByLabelText(/Email/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/contacts/c1',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'jane@example.com', name: 'Jane Doe' }),
        })
      )
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/contacts/c1'));
  });

  it('shows an error when the contact fails to load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: null, message: 'Contact not found.' }),
    } as Response);

    render(<ContactEditPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Contact not found.'));
  });

  it('shows an error when saving fails', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const contact = mockContact({ name: 'Jane Doe', email: 'jane@example.com' });

    // initial mount: contact + fields
    fetchMock.mockResolvedValueOnce(mockContactResponse(contact));
    fetchMock.mockResolvedValueOnce(mockFieldsResponse());
    // PATCH failure
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Email already in use.' }),
    } as Response);

    render(<ContactEditPage />);

    await waitFor(() => expect(screen.getByLabelText(/Email/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Email already in use.'));
    expect(router.push).not.toHaveBeenCalled();
  });
});
