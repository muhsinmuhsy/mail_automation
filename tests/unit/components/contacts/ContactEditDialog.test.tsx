import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactEditDialog } from '@/components/contacts/ContactEditDialog';

const mockContact = (overrides: Partial<{ id: string; name: string; email: string; custom_fields: Record<string, string | null> }> = {}) => ({
  id: 'c1',
  name: 'Jane',
  email: 'jane@example.com',
  ...overrides,
});

const mockContactResponse = (contact: ReturnType<typeof mockContact>) => ({
  ok: true,
  json: async () => ({ data: contact }),
}) as Response;

const noFields: Array<{ id: string; name: string; label: string; field_type: 'text'; is_required: boolean }> = [];

describe('ContactEditDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ContactEditDialog open={false} onOpenChange={vi.fn()} contactId="c1" fields={noFields} onSaved={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the dialog title when open', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockContactResponse(mockContact()));

    render(
      <ContactEditDialog open onOpenChange={vi.fn()} contactId="c1" fields={noFields} onSaved={vi.fn()} />
    );
    expect(screen.getByRole('heading', { name: 'Edit contact' })).toBeInTheDocument();
  });

  it('does not fetch when contactId is null', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: null }),
    } as Response);

    render(
      <ContactEditDialog open onOpenChange={vi.fn()} contactId={null} fields={noFields} onSaved={vi.fn()} />
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Contact not found.')).toBeInTheDocument();
  });

  it('fetches the contact by id when open', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockContactResponse(mockContact()));

    render(
      <ContactEditDialog open onOpenChange={vi.fn()} contactId="c42" fields={noFields} onSaved={vi.fn()} />
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/contacts/c42'));
  });

  it('shows a loading state while fetching the contact', async () => {
    let resolveFetch!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );

    render(
      <ContactEditDialog open onOpenChange={vi.fn()} contactId="c1" fields={noFields} onSaved={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('Loading…')).toBeInTheDocument());

    await act(async () => {
      resolveFetch(mockContactResponse(mockContact()));
    });
  });

  it('populates the form with the loaded contact values', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockContactResponse(mockContact({ name: 'Alice Smith', email: 'alice@corp.io' }))
    );

    render(
      <ContactEditDialog open onOpenChange={vi.fn()} contactId="c1" fields={noFields} onSaved={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Alice Smith'));
    expect(screen.getByLabelText('Email')).toHaveValue('alice@corp.io');
  });

  it('passes non-null custom field values as initial values to the form', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockContactResponse(
        mockContact({ custom_fields: { t_shirt_size: 'M', notes: null } })
      )
    );

    render(
      <ContactEditDialog
        open
        onOpenChange={vi.fn()}
        contactId="c1"
        fields={[{ id: 'f1', name: 't_shirt_size', label: 'T-shirt size', field_type: 'text', is_required: false }]}
        onSaved={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByLabelText('T-shirt size')).toHaveValue('M'));
  });

  it('sends a PATCH request with the edited values on submit', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(mockContactResponse(mockContact()));
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockContact({ name: 'Jane Updated' }) }),
    } as Response);

    render(
      <ContactEditDialog open onOpenChange={onOpenChange} contactId="c1" fields={noFields} onSaved={onSaved} />
    );

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Jane'));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Jane Updated');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/contacts/c1',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'jane@example.com', name: 'Jane Updated' }),
        })
      )
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('includes custom field values in the PATCH body', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(mockContactResponse(mockContact()));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: mockContact() }) } as Response);

    render(
      <ContactEditDialog
        open
        onOpenChange={vi.fn()}
        contactId="c1"
        fields={[{ id: 'f1', name: 't_shirt_size', label: 'T-shirt size', field_type: 'text', is_required: false }]}
        onSaved={onSaved}
      />
    );

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Jane'));
    await user.type(screen.getByLabelText('T-shirt size'), 'L');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/contacts/c1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ email: 'jane@example.com', name: 'Jane', t_shirt_size: 'L' }),
        })
      )
    );
  });

  it('shows an error when loading the contact fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Contact not found.' }),
    } as Response);

    render(
      <ContactEditDialog open onOpenChange={vi.fn()} contactId="c1" fields={noFields} onSaved={vi.fn()} />
    );
    await waitFor(() => expect(screen.getByText('Contact not found.')).toBeInTheDocument());
  });

  it('shows an error when saving the contact fails and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(mockContactResponse(mockContact()));
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Email already in use.' }),
    } as Response);

    render(
      <ContactEditDialog open onOpenChange={onOpenChange} contactId="c1" fields={noFields} onSaved={onSaved} />
    );

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Jane'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Email already in use.'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows a saving state on the submit button while the PATCH is pending', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(mockContactResponse(mockContact()));

    let resolvePatch!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolvePatch = resolve; })
    );

    render(
      <ContactEditDialog open onOpenChange={vi.fn()} contactId="c1" fields={noFields} onSaved={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Jane'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled());

    await act(async () => {
      resolvePatch({ ok: true, json: async () => ({ data: mockContact() }) } as Response);
    });
  });
});
