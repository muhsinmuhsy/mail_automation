import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const router = { push: vi.fn() };
const params = { id: 'c1' };
const searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useParams: () => params,
  useSearchParams: () => searchParams,
}));

import ContactDetailPage from '@/app/(dashboard)/contacts/[id]/page';

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

describe('ContactDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state while fetching', async () => {
    let resolveFetch!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );

    render(<ContactDetailPage />);

    await waitFor(() => expect(resolveFetch).toBeDefined());
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('fetches the contact and field definitions on mount', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(mockContactResponse(mockContact()));
    fetchMock.mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactDetailPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/contacts/c1'));
    expect(fetchMock).toHaveBeenCalledWith('/api/contact-fields');
  });

  it('displays the contact name and email', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockContactResponse(mockContact({ name: 'Jane Doe', email: 'jane@example.com' })))
      .mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('shows "(no name)" when the contact has an empty name', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockContactResponse(mockContact({ name: '', email: 'jane@example.com' })))
      .mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByText('(no name)')).toBeInTheDocument());
  });

  it('displays custom field values with their labels', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockContactResponse(mockContact({ custom_fields: { t_shirt_size: 'M' } }))
      )
      .mockResolvedValueOnce(
        mockFieldsResponse([
          { id: 'f1', name: 't_shirt_size', label: 'T-shirt size', field_type: 'text', is_required: false },
        ])
      );

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByText('T-shirt size:')).toBeInTheDocument());
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('uses the raw field name as the label when no definition is found', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockContactResponse(mockContact({ custom_fields: { unknown_field: 'X' } }))
      )
      .mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByText('unknown_field:')).toBeInTheDocument());
    expect(screen.getByText('X')).toBeInTheDocument();
  });

  it('hides custom fields whose value is null or empty', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockContactResponse(mockContact({ custom_fields: { t_shirt_size: null, notes: '' } }))
      )
      .mockResolvedValueOnce(
        mockFieldsResponse([
          { id: 'f1', name: 't_shirt_size', label: 'T-shirt size', field_type: 'text', is_required: false },
          { id: 'f2', name: 'notes', label: 'Notes', field_type: 'text', is_required: false },
        ])
      );

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.queryByText('T-shirt size:')).not.toBeInTheDocument();
    expect(screen.queryByText('Notes:')).not.toBeInTheDocument();
  });

  it('navigates back to /contacts when Back is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockContactResponse(mockContact()))
      .mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(router.push).toHaveBeenCalledWith('/contacts');
  });

  it('shows the contact details and an Edit button in view mode', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockContactResponse(mockContact()))
      .mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('navigates to the edit page when Edit is clicked', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockContactResponse(mockContact()))
      .mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).toHaveBeenCalledWith('/contacts/c1/edit');
  });

  it('shows an error when the contact fails to load', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: null, message: 'Contact not found.' }),
    } as Response);

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Contact not found.'));
  });

  it('shows the created date when available', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockContactResponse(mockContact({ created_at: '2024-01-15T10:00:00Z' }))
      )
      .mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByText(/Created/)).toBeInTheDocument());
  });

  it('does not show a created date when unavailable', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockContactResponse(mockContact()))
      .mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.queryByText(/Created/)).not.toBeInTheDocument();
  });

  it('renders the page heading and description', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockContactResponse(mockContact()))
      .mockResolvedValueOnce(mockFieldsResponse());

    render(<ContactDetailPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Contact' })).toBeInTheDocument());
    expect(screen.getByText('View and edit contact details.')).toBeInTheDocument();
  });
});
