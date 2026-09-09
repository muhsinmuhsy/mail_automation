import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/templates/VisualEmailEditorLazy', () => ({
  default: () => null,
}));

import TemplatesPage from '@/app/(dashboard)/templates/page';

const mockTemplate = (id: string, name: string, subject: string) => ({
  id,
  name,
  subject,
  created_at: new Date('2030-01-01').toISOString(),
});

const mockPagination = (total: number, page: number, pageSize = 20) => ({
  total,
  page,
  pageSize,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

const mockListResponse = (templates: ReturnType<typeof mockTemplate>[], total?: number) => ({
  ok: true,
  json: async () => ({
    success: true,
    data: templates,
    pagination: mockPagination(total ?? templates.length, 1),
  }),
}) as Response;

describe('TemplatesPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads templates on mount with pagination params', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockListResponse([mockTemplate('t1', 'Welcome', 'Hi there')])
    );

    render(<TemplatesPage />);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/templates?page=1&limit=20')
    );
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByText('Hi there')).toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    let resolveFetch!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(<TemplatesPage />);

    await waitFor(() => expect(resolveFetch).toBeDefined());

    expect(screen.getByText('Templates')).toBeInTheDocument();
    expect(screen.queryByText('Welcome')).not.toBeInTheDocument();

    resolveFetch({
      ok: true,
      json: async () => ({ success: true, data: [], pagination: mockPagination(0, 1) }),
    } as Response);
  });

  it('shows an error when loading fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: { message: 'Network error' } }),
    } as Response);

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network error'));
  });

  it('shows empty state when there are no templates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockListResponse([]));

    render(<TemplatesPage />);

    await waitFor(() =>
      expect(screen.getByText('No templates yet')).toBeInTheDocument()
    );
  });

  it('opens the editor dialog when New template is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockListResponse([mockTemplate('t1', 'Welcome', 'Hi')])
    );

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument()
    );
    expect(screen.getByLabelText('Template name')).toBeInTheDocument();
    expect(screen.getByLabelText('Subject')).toBeInTheDocument();
  });

  it('submits a plain text template and reloads the list', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      mockListResponse([mockTemplate('t1', 'Existing', 'Subject')])
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockTemplate('t2', 'New template', 'New subject'),
        message: 'Template created successfully.',
      }),
    } as Response);

    fetchMock.mockResolvedValueOnce(
      mockListResponse(
        [mockTemplate('t2', 'New template', 'New subject'),
         mockTemplate('t1', 'Existing', 'Subject')],
        2
      )
    );

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Existing')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Plain text' }));

    await user.type(screen.getByLabelText('Template name'), 'New template');
    await user.type(screen.getByLabelText('Subject'), 'New subject');
    await user.type(screen.getByLabelText('Plain text body'), 'Body text');
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

    await waitFor(() =>
      expect(screen.getAllByText('New template').length).toBeGreaterThanOrEqual(1)
    );
    expect(screen.getByText('New subject')).toBeInTheDocument();
  });

  it('shows an error when saving fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockListResponse([]))
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, error: { message: 'Save failed' } }),
      } as Response);

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Plain text' }));

    await user.type(screen.getByLabelText('Template name'), 'Bad template');
    await user.type(screen.getByLabelText('Subject'), 'Subject');
    await user.type(screen.getByLabelText('Plain text body'), 'Body');
    await user.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Save failed')
    );
  });

  it('disables the save button while saving', async () => {
    const user = userEvent.setup();
    let resolveCreate!: (value: Response) => void;
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(mockListResponse([]));

    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Plain text' }));

    await user.type(screen.getByLabelText('Template name'), 'Slow template');
    await user.type(screen.getByLabelText('Subject'), 'Subject');
    await user.type(screen.getByLabelText('Plain text body'), 'Body');
    await user.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save template' })).toBeDisabled()
    );

    resolveCreate({
      ok: true,
      json: async () => ({
        success: true,
        data: mockTemplate('t3', 'Slow template', 'Subject'),
        message: 'Template created successfully.',
      }),
    } as Response);
  });

  it('closes the dialog after successful save', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockListResponse([]))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockTemplate('t4', 'Persisted', 'Subject'),
          message: 'Template created successfully.',
        }),
      } as Response)
      .mockResolvedValueOnce(mockListResponse([mockTemplate('t4', 'Persisted', 'Subject')], 1));

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Plain text' }));

    await user.type(screen.getByLabelText('Template name'), 'Persisted');
    await user.type(screen.getByLabelText('Subject'), 'Subject');
    await user.type(screen.getByLabelText('Plain text body'), 'Body');
    await user.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'New template' })).not.toBeInTheDocument()
    );
  });

  it('closes the dialog when Cancel is clicked', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockListResponse([mockTemplate('t1', 'Welcome', 'Hi')])
    );

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'New template' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'New template' })).not.toBeInTheDocument()
    );
  });

  it('renders Edit and Preview buttons on template cards', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockListResponse([mockTemplate('t1', 'Welcome', 'Hi')])
    );

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument();
  });

  it('opens the editor in edit mode when Edit is clicked', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      mockListResponse([mockTemplate('t1', 'Welcome', 'Hi')])
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 't1',
          name: 'Welcome',
          subject: 'Hi',
          body: 'Hello',
          body_json: null,
          body_html: null,
          body_text: 'Hello',
        },
      }),
    } as Response);

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/templates/t1')
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Edit template' })).toBeInTheDocument()
    );
  });

  it('opens the preview dialog when Preview is clicked', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(
      mockListResponse([mockTemplate('t1', 'Welcome', 'Hi')])
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { html: '<p>Hello</p>', text: 'Hello', subject: 'Hi' },
      }),
    } as Response);

    render(<TemplatesPage />);

    await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/templates/t1/preview',
        expect.objectContaining({ method: 'POST' })
      )
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Template preview' })).toBeInTheDocument()
    );
  });

  describe('pagination', () => {
    it('shows the total template count', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockListResponse([mockTemplate('t1', 'Welcome', 'Hi there')], 25)
      );

      render(<TemplatesPage />);

      await waitFor(() => expect(screen.getByText('25 templates')).toBeInTheDocument());
    });

    it('uses the singular "template" when there is exactly one', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockListResponse([mockTemplate('t1', 'Welcome', 'Hi there')], 1)
      );

      render(<TemplatesPage />);

      await waitFor(() => expect(screen.getByText('1 template')).toBeInTheDocument());
    });

    it('does not render pagination controls when there is only one page', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockListResponse([mockTemplate('t1', 'Welcome', 'Hi there')], 1)
      );

      render(<TemplatesPage />);

      await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    });

    it('renders pagination controls when there are multiple pages', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockListResponse([mockTemplate('t1', 'Welcome', 'Hi there')], 25)
      );

      render(<TemplatesPage />);

      await waitFor(() => expect(screen.getByText('Welcome')).toBeInTheDocument());
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    });

    it('fetches the next page when Next is clicked', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.spyOn(globalThis, 'fetch');

      const page1Templates = Array.from({ length: 20 }, (_, i) =>
        mockTemplate(`p1-${i}`, `Page1 ${i}`, `Subject ${i}`)
      );

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: page1Templates,
          pagination: mockPagination(25, 1),
        }),
      } as Response);

      const page2Templates = Array.from({ length: 5 }, (_, i) =>
        mockTemplate(`p2-${i}`, `Page2 ${i}`, `Subject ${i}`)
      );

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: page2Templates,
          pagination: mockPagination(25, 2),
        }),
      } as Response);

      render(<TemplatesPage />);

      await waitFor(() => expect(screen.getByText('Page1 0')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Next' }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith('/api/templates?page=2&limit=20')
      );
      await waitFor(() => expect(screen.getByText('Page2 0')).toBeInTheDocument());
      expect(screen.queryByText('Page1 0')).not.toBeInTheDocument();
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    });

    it('fetches the previous page when Previous is clicked', async () => {
      const user = userEvent.setup();
      const fetchMock = vi.spyOn(globalThis, 'fetch');

      const page1Templates = Array.from({ length: 20 }, (_, i) =>
        mockTemplate(`p1-${i}`, `Page1 ${i}`, `Subject ${i}`)
      );

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: page1Templates,
          pagination: mockPagination(25, 1),
        }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockTemplate('p2-0', 'Page2 Contact', 'Subject')],
          pagination: mockPagination(25, 2),
        }),
      } as Response);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: [mockTemplate('p1-0', 'Page1 Contact', 'Subject')],
          pagination: mockPagination(25, 1),
        }),
      } as Response);

      render(<TemplatesPage />);

      await waitFor(() => expect(screen.getByText('Page1 0')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(screen.getByText('Page2 Contact')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Previous' }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith('/api/templates?page=1&limit=20')
      );
      await waitFor(() => expect(screen.getByText('Page1 Contact')).toBeInTheDocument());
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
  });
});
