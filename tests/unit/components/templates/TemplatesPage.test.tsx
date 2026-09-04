import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplatesPage from '@/app/(dashboard)/templates/page';

const mockTemplate = (id: string, name: string, subject: string) => ({
  id,
  name,
  subject,
  created_at: new Date('2030-01-01').toISOString(),
});

describe('TemplatesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads templates on mount', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [mockTemplate('t1', 'Welcome', 'Hi there')],
      }),
    } as Response);

    render(<TemplatesPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/templates'));
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    let resolveFetch: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(<TemplatesPage />);

    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.queryByText('Welcome')).not.toBeInTheDocument();

    resolveFetch!({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as Response);
  });

  it('shows an error when loading fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Network error' } }),
    } as Response);

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network error'));
  });

  it('shows empty state when there are no templates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as Response);

    render(<TemplatesPage />);

    await waitFor(() =>
      expect(screen.getByText('No templates yet')).toBeInTheDocument()
    );
  });

  it('submits the form and adds the new template to the list', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [mockTemplate('t1', 'Existing', 'Subject')],
      }),
    } as Response);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockTemplate('t2', 'New template', 'New subject'),
        message: 'Template created successfully.',
      }),
    } as Response);

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Existing')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    await user.type(screen.getByLabelText('Template name'), 'New template');
    await user.type(screen.getByLabelText('Subject'), 'New subject');
    await user.type(screen.getByLabelText('Body'), 'Body text');
    await user.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/templates',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'New template', subject: 'New subject', body: 'Body text' }),
        })
      )
    );

    const cards = screen.getAllByText('New template');
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('New subject')).toBeInTheDocument();
  });

  it('shows an error when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Save failed' } }),
      } as Response);

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    await user.type(screen.getByLabelText('Template name'), 'Bad template');
    await user.type(screen.getByLabelText('Subject'), 'Subject');
    await user.type(screen.getByLabelText('Body'), 'Body');
    await user.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Save failed')
    );
  });

  it('disables the submit button while saving', async () => {
    const user = userEvent.setup();
    let resolveCreate: (value: Response) => void;
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    } as Response);

    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    await user.type(screen.getByLabelText('Template name'), 'Slow template');
    await user.type(screen.getByLabelText('Subject'), 'Subject');
    await user.type(screen.getByLabelText('Body'), 'Body');
    await user.click(screen.getByRole('button', { name: 'Save template' }));

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();

    resolveCreate!({
      ok: true,
      json: async () => ({
        success: true,
        data: mockTemplate('t3', 'Slow template', 'Subject'),
        message: 'Template created successfully.',
      }),
    } as Response);
  });

  it('hides the form after successful save', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockTemplate('t4', 'Persisted', 'Subject'),
          message: 'Template created successfully.',
        }),
      } as Response);

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    expect(screen.getByLabelText('Template name')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Template name'), 'Persisted');
    await user.type(screen.getByLabelText('Subject'), 'Subject');
    await user.type(screen.getByLabelText('Body'), 'Body');
    await user.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() =>
      expect(screen.queryByLabelText('Template name')).not.toBeInTheDocument()
    );
  });
});
