import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttachmentCard } from '@/components/attachments/AttachmentCard';

describe('AttachmentCard', () => {
  const attachment = { id: 'r1', filename: 'alice-cv.pdf', size_bytes: 2048, is_default: false };

  it('renders the filename', () => {
    render(<AttachmentCard attachment={attachment} />);
    expect(screen.getByText('alice-cv.pdf')).toBeInTheDocument();
  });

  it('formats the size in KB with one decimal', () => {
    render(<AttachmentCard attachment={attachment} />);
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it.each([
    [0, '0.0 KB'],
    [512, '0.5 KB'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1048576, '1024.0 KB'],
    [1234567, '1205.6 KB'],
  ])('formats %i bytes as %s', (bytes, expected) => {
    render(<AttachmentCard attachment={{ ...attachment, size_bytes: bytes }} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('does not render a default marker on the card', () => {
    render(<AttachmentCard attachment={{ ...attachment, is_default: true }} />);
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
  });

  it('emphasises the filename and de-emphasises the size', () => {
    render(<AttachmentCard attachment={attachment} />);
    expect(screen.getByText('alice-cv.pdf')).toHaveClass('font-medium', 'text-text-primary');
    expect(screen.getByText('2.0 KB').parentElement).toHaveClass('text-sm', 'text-text-secondary');
  });

  it('renders a bordered card container', () => {
    const { container } = render(<AttachmentCard attachment={attachment} />);
    expect(container.firstChild).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-4');
  });

  it('renders long filenames verbatim', () => {
    const filename = `${'x'.repeat(120)}.pdf`;
    render(<AttachmentCard attachment={{ ...attachment, filename }} />);
    expect(screen.getByText(filename)).toBeInTheDocument();
  });

  describe('download', () => {
    it('does not render a download button when onDownload is not provided', () => {
      render(<AttachmentCard attachment={attachment} />);
      expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
    });

    it('renders a download button when onDownload is provided', () => {
      render(<AttachmentCard attachment={attachment} onDownload={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    });

    it('calls onDownload with the attachment id when clicked', async () => {
      const user = userEvent.setup();
      const onDownload = vi.fn();
      render(<AttachmentCard attachment={attachment} onDownload={onDownload} />);

      await user.click(screen.getByRole('button', { name: 'Download' }));

      expect(onDownload).toHaveBeenCalledWith('r1');
    });
  });

  describe('delete', () => {
    it('does not render a delete button when onDelete is not provided', () => {
      render(<AttachmentCard attachment={attachment} />);
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('renders a destructive delete button when onDelete is provided', () => {
      render(<AttachmentCard attachment={attachment} onDelete={vi.fn()} />);
      const button = screen.getByRole('button', { name: 'Delete' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('bg-error');
    });

    it('calls onDelete with the attachment id when clicked', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      render(<AttachmentCard attachment={attachment} onDelete={onDelete} />);

      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(onDelete).toHaveBeenCalledWith('r1');
    });

    it('disables the delete button while deleting', () => {
      render(<AttachmentCard attachment={attachment} onDelete={vi.fn()} deleting />);
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    });
  });

  describe('action button layout', () => {
    it('renders action buttons in a horizontal row', () => {
      render(<AttachmentCard attachment={attachment} onDownload={vi.fn()} onDelete={vi.fn()} />);
      const downloadButton = screen.getByRole('button', { name: 'Download' });
      const deleteButton = screen.getByRole('button', { name: 'Delete' });
      expect(downloadButton.parentElement).toHaveClass('flex', 'gap-2');
      expect(deleteButton.parentElement).toBe(downloadButton.parentElement);
    });
  });
});
