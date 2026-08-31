import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchInput } from '@/components/ui/SearchInput';

describe('SearchInput', () => {
  it('renders a search input', () => {
    render(<SearchInput value="" onChange={vi.fn()} />);
    const input = screen.getByDisplayValue('') as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'search');
  });

  it('uses a default placeholder', () => {
    render(<SearchInput value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('uses a custom placeholder', () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Find users" />);
    expect(screen.getByPlaceholderText('Find users')).toBeInTheDocument();
  });

  it('reflects the controlled value', () => {
    render(<SearchInput value="abc" onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('abc')).toBeInTheDocument();
  });

  it('calls onChange with the new value', () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue(''), { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalledWith('hello');
  });
});
