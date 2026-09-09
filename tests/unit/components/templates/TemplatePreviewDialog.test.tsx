import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TemplatePreviewDialog } from '@/components/templates/TemplatePreviewDialog';

describe('TemplatePreviewDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <TemplatePreviewDialog open={false} onOpenChange={vi.fn()} templateId="t1" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the preview heading when open', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { html: '<p>Hi</p>', text: 'Hi', subject: 'Subject' },
      }),
    } as Response);

    render(
      <TemplatePreviewDialog open={true} onOpenChange={vi.fn()} templateId="t1" />
    );

    expect(screen.getByRole('heading', { name: 'Template preview' })).toBeInTheDocument();
  });

  it('fetches the preview from POST /api/templates/[id]/preview on open', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { html: '<p>Hello</p>', text: 'Hello', subject: 'Hi' },
      }),
    } as Response);

    render(
      <TemplatePreviewDialog open={true} onOpenChange={vi.fn()} templateId="t1" />
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/templates/t1/preview',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      )
    );
  });

  it('renders the subject, HTML iframe, and text preview', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          html: '<p>Hello world</p>',
          text: 'Hello world',
          subject: 'Welcome aboard',
        },
      }),
    } as Response);

    render(
      <TemplatePreviewDialog open={true} onOpenChange={vi.fn()} templateId="t1" />
    );

    await waitFor(() => expect(screen.getByText('Welcome aboard')).toBeInTheDocument());

    const iframe = screen.getByTitle('Email preview') as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(iframe.getAttribute('srcdoc')).toBe('<p>Hello world</p>');
  });

  it('renders a text preview when html is null (legacy template)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          html: null,
          text: 'Plain text body',
          subject: 'Subject',
        },
      }),
    } as Response);

    render(
      <TemplatePreviewDialog open={true} onOpenChange={vi.fn()} templateId="t1" />
    );

    await waitFor(() => expect(screen.getByText('Plain text body')).toBeInTheDocument());
    expect(screen.queryByTitle('Email preview')).not.toBeInTheDocument();
  });

  it('shows an error when the preview API fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: { message: 'Template not found.' } }),
    } as Response);

    render(
      <TemplatePreviewDialog open={true} onOpenChange={vi.fn()} templateId="t1" />
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Template not found.')
    );
  });

  it('calls onOpenChange(false) when Close is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { html: null, text: 'Hi', subject: 'Sub' },
      }),
    } as Response);

    render(
      <TemplatePreviewDialog
        open={true}
        onOpenChange={onOpenChange}
        templateId="t1"
      />
    );

    await waitFor(() => expect(screen.getByText('Sub')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not fetch when templateId is null', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    render(
      <TemplatePreviewDialog open={true} onOpenChange={vi.fn()} templateId={null} />
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a sandboxed iframe with scripts disabled', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { html: '<p>Hi</p>', text: 'Hi', subject: 'Sub' },
      }),
    } as Response);

    render(
      <TemplatePreviewDialog open={true} onOpenChange={vi.fn()} templateId="t1" />
    );

    await waitFor(() => expect(screen.getByTitle('Email preview')).toBeInTheDocument());

    const iframe = screen.getByTitle('Email preview') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toBe('');
  });
});
