import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from '@/components/ui/Pagination';

describe('Pagination', () => {
  it('renders the current page and total pages', () => {
    render(<Pagination page={3} totalPages={10} onPageChange={vi.fn()} />);
    expect(screen.getByText('Page 3 of 10')).toBeInTheDocument();
  });

  it('disables the Previous button on the first page', () => {
    render(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('enables Previous and calls onPageChange(page - 1)', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={4} totalPages={10} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('disables the Next button on the last page', () => {
    render(<Pagination page={5} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('enables Next and calls onPageChange(page + 1)', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} totalPages={5} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('keeps Previous disabled on the first page so page never goes below 1', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={5} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });

  it('keeps Next disabled on the last page so page never exceeds total pages', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={5} totalPages={5} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});
