import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminEmailTable } from '@/components/admin/AdminEmailTable';

describe('AdminEmailTable', () => {
  it('renders the placeholder copy', () => {
    render(<AdminEmailTable />);
    expect(screen.getByText('Email administration table placeholder.')).toBeInTheDocument();
  });

  it('renders a bordered card container', () => {
    const { container } = render(<AdminEmailTable />);
    expect(container.firstChild).toHaveClass('border', 'border-neutral-200', 'bg-background', 'p-4');
  });

  it('uses the medium radius design token', () => {
    const { container } = render(<AdminEmailTable />);
    expect((container.firstChild as HTMLElement).className).toContain('rounded-[var(--radius-md)]');
  });

  it('styles the placeholder as small secondary text', () => {
    render(<AdminEmailTable />);
    expect(screen.getByText('Email administration table placeholder.')).toHaveClass(
      'text-sm',
      'text-text-secondary'
    );
  });

  it('does not render an actual table element yet', () => {
    const { container } = render(<AdminEmailTable />);
    expect(container.querySelector('table')).not.toBeInTheDocument();
  });

  it('renders no interactive controls', () => {
    render(<AdminEmailTable />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('takes no props and renders deterministically', () => {
    const a = render(<AdminEmailTable />).container.innerHTML;
    const b = render(<AdminEmailTable />).container.innerHTML;
    expect(a).toBe(b);
  });
});
