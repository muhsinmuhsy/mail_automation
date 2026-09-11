import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SortSelect } from '@/components/ui/SortSelect';

describe('SortSelect', () => {
  it('renders both sort options', () => {
    render(<SortSelect value="desc" onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Newest first' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Oldest first' })).toBeInTheDocument();
  });

  it('uses "Sort" as the default label', () => {
    render(<SortSelect value="desc" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Sort')).toBeInTheDocument();
  });

  it('uses a custom label when provided', () => {
    render(<SortSelect value="desc" onChange={vi.fn()} label="Order" />);
    expect(screen.getByLabelText('Order')).toBeInTheDocument();
  });

  it('reflects the desc value as the selected option', () => {
    render(<SortSelect value="desc" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Sort')).toHaveValue('desc');
  });

  it('reflects the asc value as the selected option', () => {
    render(<SortSelect value="asc" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Sort')).toHaveValue('asc');
  });

  it('calls onChange with "asc" when switching to Oldest first', () => {
    const onChange = vi.fn();
    render(<SortSelect value="desc" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'asc' } });
    expect(onChange).toHaveBeenCalledWith('asc');
  });

  it('calls onChange with "desc" when switching to Newest first', () => {
    const onChange = vi.fn();
    render(<SortSelect value="asc" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'desc' } });
    expect(onChange).toHaveBeenCalledWith('desc');
  });

  it('wraps the select in a fixed-width container', () => {
    const { container } = render(<SortSelect value="desc" onChange={vi.fn()} />);
    expect(container.firstChild).toHaveClass('w-44');
  });

  it('renders exactly two options', () => {
    render(<SortSelect value="desc" onChange={vi.fn()} />);
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
});
