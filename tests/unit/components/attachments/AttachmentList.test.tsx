import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttachmentList } from '@/components/attachments/AttachmentList';

const attachments = [
  { id: 'r1', filename: 'default-cv.pdf', size_bytes: 1024, is_default: true },
  { id: 'r2', filename: 'backend-cv.pdf', size_bytes: 4096, is_default: false },
  { id: 'r3', filename: 'design-cv.pdf', size_bytes: 512, is_default: false },
];

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from((container.firstElementChild as HTMLElement).children) as HTMLElement[];
}

describe('AttachmentList', () => {
  it('renders one row per attachment', () => {
    const { container } = render(<AttachmentList attachments={attachments} />);
    expect(rows(container)).toHaveLength(3);
  });

  it('renders each filename and formatted size', () => {
    render(<AttachmentList attachments={attachments} />);
    expect(screen.getByText('default-cv.pdf')).toBeInTheDocument();
    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
    expect(screen.getByText('backend-cv.pdf')).toBeInTheDocument();
    expect(screen.getByText('4.0 KB')).toBeInTheDocument();
    expect(screen.getByText('design-cv.pdf')).toBeInTheDocument();
    expect(screen.getByText('0.5 KB')).toBeInTheDocument();
  });

  it('renders an empty container when there are no attachments', () => {
    const { container } = render(<AttachmentList attachments={[]} />);
    expect(container.firstChild).toBeEmptyDOMElement();
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('renders a single attachment', () => {
    const { container } = render(<AttachmentList attachments={[attachments[1]]} />);
    expect(rows(container)).toHaveLength(1);
    expect(screen.getByText('backend-cv.pdf')).toBeInTheDocument();
  });

  it('renders each row as a bordered card', () => {
    const { container } = render(<AttachmentList attachments={[attachments[0]]} />);
    expect(rows(container)[0]).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-4');
  });

  it('preserves the provided order', () => {
    const { container } = render(<AttachmentList attachments={attachments} />);
    const names = Array.from(container.querySelectorAll('p.font-medium')).map((p) => p.textContent);
    expect(names).toEqual(['default-cv.pdf', 'backend-cv.pdf', 'design-cv.pdf']);
  });

  it('formats a zero-byte attachment', () => {
    render(<AttachmentList attachments={[{ id: 'z', filename: 'empty.pdf', size_bytes: 0, is_default: false }]} />);
    expect(screen.getByText('0.0 KB')).toBeInTheDocument();
  });

  it('renders many attachments', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `r-${i}`,
      filename: `cv-${i}.pdf`,
      size_bytes: 1024 * (i + 1),
      is_default: i === 4,
    }));
    const { container } = render(<AttachmentList attachments={many} />);
    expect(rows(container)).toHaveLength(15);
    expect(screen.getByText('15.0 KB')).toBeInTheDocument();
  });
});
