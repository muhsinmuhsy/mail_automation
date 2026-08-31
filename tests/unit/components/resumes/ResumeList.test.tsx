import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumeList } from '@/components/resumes/ResumeList';

const resumes = [
  { id: 'r1', filename: 'default-cv.pdf', size_bytes: 1024, is_default: true },
  { id: 'r2', filename: 'backend-cv.pdf', size_bytes: 4096, is_default: false },
  { id: 'r3', filename: 'design-cv.pdf', size_bytes: 512, is_default: false },
];

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from((container.firstElementChild as HTMLElement).children) as HTMLElement[];
}

describe('ResumeList', () => {
  it('renders one row per resume', () => {
    const { container } = render(<ResumeList resumes={resumes} />);
    expect(rows(container)).toHaveLength(3);
  });

  it('renders each filename and formatted size', () => {
    render(<ResumeList resumes={resumes} />);
    expect(screen.getByText('default-cv.pdf')).toBeInTheDocument();
    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
    expect(screen.getByText('backend-cv.pdf')).toBeInTheDocument();
    expect(screen.getByText('4.0 KB')).toBeInTheDocument();
    expect(screen.getByText('design-cv.pdf')).toBeInTheDocument();
    expect(screen.getByText('0.5 KB')).toBeInTheDocument();
  });

  it('renders a Default marker only for the default resume', () => {
    render(<ResumeList resumes={resumes} />);
    const markers = screen.getAllByText('Default');
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveClass('text-xs', 'font-medium', 'text-information');
  });

  it('renders no Default marker when none is default', () => {
    render(<ResumeList resumes={resumes.map((r) => ({ ...r, is_default: false }))} />);
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
  });

  it('renders a Default marker for every default resume', () => {
    render(<ResumeList resumes={resumes.map((r) => ({ ...r, is_default: true }))} />);
    expect(screen.getAllByText('Default')).toHaveLength(3);
  });

  it('renders an empty container when there are no resumes', () => {
    const { container } = render(<ResumeList resumes={[]} />);
    expect(container.firstChild).toBeEmptyDOMElement();
    expect(container.firstChild).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('renders a single resume', () => {
    const { container } = render(<ResumeList resumes={[resumes[1]]} />);
    expect(rows(container)).toHaveLength(1);
    expect(screen.getByText('backend-cv.pdf')).toBeInTheDocument();
  });

  it('uses a space-between row layout', () => {
    const { container } = render(<ResumeList resumes={[resumes[0]]} />);
    expect(rows(container)[0]).toHaveClass('flex', 'items-center', 'justify-between');
  });

  it('preserves the provided order', () => {
    const { container } = render(<ResumeList resumes={resumes} />);
    const names = Array.from(container.querySelectorAll('p.font-medium')).map((p) => p.textContent);
    expect(names).toEqual(['default-cv.pdf', 'backend-cv.pdf', 'design-cv.pdf']);
  });

  it('formats a zero-byte resume', () => {
    render(<ResumeList resumes={[{ id: 'z', filename: 'empty.pdf', size_bytes: 0, is_default: false }]} />);
    expect(screen.getByText('0.0 KB')).toBeInTheDocument();
  });

  it('renders many resumes', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `r-${i}`,
      filename: `cv-${i}.pdf`,
      size_bytes: 1024 * (i + 1),
      is_default: i === 4,
    }));
    const { container } = render(<ResumeList resumes={many} />);
    expect(rows(container)).toHaveLength(15);
    expect(screen.getAllByText('Default')).toHaveLength(1);
    expect(screen.getByText('15.0 KB')).toBeInTheDocument();
  });
});
