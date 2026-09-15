import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/templates/VisualEmailEditorLazy', () => ({
  default: () => null,
}));

import { TemplateEditorDialog } from '@/components/templates/TemplateEditorDialog';

describe('TemplateEditorDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <TemplateEditorDialog open={false} onOpenChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the New template heading when no templateId is provided', () => {
    render(<TemplateEditorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument();
  });

  it('renders the Edit template heading when templateId is provided', () => {
    render(
      <TemplateEditorDialog open={true} onOpenChange={vi.fn()} templateId="t1" />
    );
    expect(screen.getByRole('heading', { name: 'Edit template' })).toBeInTheDocument();
  });

  it('renders name and subject inputs', () => {
    render(<TemplateEditorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/Template name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Subject/)).toBeInTheDocument();
  });

  it('renders Visual and Plain text mode tabs', () => {
    render(<TemplateEditorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Visual' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Plain text' })).toBeInTheDocument();
  });

  it('shows the plain text textarea when Plain text tab is selected', async () => {
    const user = userEvent.setup();
    render(<TemplateEditorDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('tab', { name: 'Plain text' }));

    expect(screen.getByLabelText('Plain text body')).toBeInTheDocument();
  });

  it('does not show the plain text textarea when Visual tab is selected', () => {
    render(<TemplateEditorDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.queryByLabelText('Plain text body')).not.toBeInTheDocument();
  });

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<TemplateEditorDialog open={true} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a validation error when saving without name or subject', async () => {
    const user = userEvent.setup();
    render(<TemplateEditorDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save template' }));

    expect(screen.getByText('Template name is required.')).toBeInTheDocument();
    expect(screen.getByText('Subject is required.')).toBeInTheDocument();
  });

  it('POSTs to /api/templates with plain text body on save', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 't1' }, message: 'Created.' }),
    } as Response);

    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <TemplateEditorDialog
        open={true}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Plain text' }));
    await user.type(screen.getByLabelText(/Template name/), 'My template');
    await user.type(screen.getByLabelText(/Subject/), 'Hello');
    await user.type(screen.getByLabelText('Plain text body'), 'Body content');
    await user.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/templates',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'My template',
          subject: 'Hello',
          body: 'Body content',
        }),
      })
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('PATCHes to /api/templates/[id] when editing', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 't1',
          name: 'Old',
          subject: 'Old subject',
          body: 'Old body',
          body_json: null,
          body_html: null,
          body_text: 'Old body',
        },
      }),
    } as Response);

    render(
      <TemplateEditorDialog
        open={true}
        onOpenChange={vi.fn()}
        templateId="t1"
      />
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/templates/t1'));

    await user.clear(screen.getByLabelText(/Template name/));
    await user.type(screen.getByLabelText(/Template name/), 'Updated name');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: 'Updated.' }),
    } as Response);

    await user.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/templates/t1',
        expect.objectContaining({ method: 'PATCH' })
      )
    );
  });

  it('shows an error when the save API returns failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: { message: 'Render failed.' } }),
    } as Response);

    render(<TemplateEditorDialog open={true} onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole('tab', { name: 'Plain text' }));
    await user.type(screen.getByLabelText(/Template name/), 'Bad');
    await user.type(screen.getByLabelText(/Subject/), 'Subject');
    await user.type(screen.getByLabelText('Plain text body'), 'Body');
    await user.click(screen.getByRole('button', { name: 'Save template' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Render failed.')
    );
  });

  it('loads existing template data when templateId is provided', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 't1',
          name: 'Existing',
          subject: 'Existing subject',
          body: 'Existing body',
          body_json: null,
          body_html: null,
          body_text: 'Existing body',
        },
      }),
    } as Response);

    render(
      <TemplateEditorDialog
        open={true}
        onOpenChange={vi.fn()}
        templateId="t1"
      />
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/Template name/)).toHaveValue('Existing')
    );
    expect(screen.getByLabelText(/Subject/)).toHaveValue('Existing subject');
  });

  it('switches to plain text mode when loading a legacy template without body_json', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 't1',
          name: 'Legacy',
          subject: 'Sub',
          body: 'Legacy body',
          body_json: null,
          body_html: null,
          body_text: 'Legacy body',
        },
      }),
    } as Response);

    render(
      <TemplateEditorDialog
        open={true}
        onOpenChange={vi.fn()}
        templateId="t1"
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Plain text' })).toHaveAttribute('aria-selected', 'true')
    );
    expect(screen.getByLabelText('Plain text body')).toHaveValue('Legacy body');
  });
});
