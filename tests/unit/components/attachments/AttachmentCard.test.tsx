import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('2.0 KB')).toHaveClass('text-sm', 'text-text-secondary');
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
});
