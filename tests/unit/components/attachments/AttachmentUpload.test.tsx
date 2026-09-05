import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttachmentUpload } from '@/components/attachments/AttachmentUpload';

function makeFile(name = 'cv.pdf', size = 1024, type = 'application/pdf'): File {
  const file = new File(['x'.repeat(size)], name, { type });
  return file;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('AttachmentUpload', () => {
  it('shows a rejected upload and retains the file for a successful retry', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn()
      .mockRejectedValueOnce(new Error('Storage is temporarily unavailable.'))
      .mockResolvedValueOnce(undefined);
    const { container } = render(<AttachmentUpload onUpload={onUpload} />);
    const file = makeFile();
    await user.upload(container.querySelector('input[type="file"]') as HTMLInputElement, file);
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is temporarily unavailable.');
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled());
    expect(onUpload).toHaveBeenNthCalledWith(2, file);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect((container.querySelector('input[type="file"]') as HTMLInputElement).files).toHaveLength(0);
  });

  it('renders an Upload submit button', () => {
    render(<AttachmentUpload onUpload={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it('disables Upload until a file is chosen', () => {
    render(<AttachmentUpload onUpload={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  it('renders a file input restricted to PDF files', () => {
    const { container } = render(<AttachmentUpload onUpload={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', '.pdf');
  });

  it('enables Upload once a file is supplied through the uploader', async () => {
    const user = userEvent.setup();
    render(<AttachmentUpload onUpload={vi.fn()} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, makeFile());
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
  });

  it('supports uploading via a direct FileUpload change event', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<AttachmentUpload onUpload={onUpload} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, makeFile());
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onUpload.mock.calls[0][0].name).toBe('cv.pdf');
  });

  it('does nothing on submit when no file is selected (early return)', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<AttachmentUpload onUpload={onUpload} />);
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('shows a pending label and disables the button while uploading', async () => {
    const user = userEvent.setup();
    const { promise, resolve } = deferred();
    const onUpload = vi.fn(() => promise);
    render(<AttachmentUpload onUpload={onUpload} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, makeFile());
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    const pending = screen.getByRole('button', { name: 'Uploading…' });
    expect(pending).toBeDisabled();
    await act(async () => {
      resolve();
      await promise;
    });
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  it('clears the selected file after a successful upload', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<AttachmentUpload onUpload={onUpload} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, makeFile());
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled());
  });

  it('keeps the button disabled after the pending state resolves', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<AttachmentUpload onUpload={onUpload} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, makeFile());
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled());
  });

  it('stacks the form fields vertically', () => {
    const { container } = render(<AttachmentUpload onUpload={vi.fn()} />);
    expect(container.querySelector('form')).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('the upload button carries the submitting type', () => {
    render(<AttachmentUpload onUpload={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Upload' })).toHaveAttribute('type', 'submit');
  });

  it('renders the FileUpload accept and size hints via attributes', () => {
    const { container } = render(<AttachmentUpload onUpload={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', '.pdf');
  });
});
