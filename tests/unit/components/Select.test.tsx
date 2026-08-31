import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from '@/components/ui/Select';

const options = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
];

describe('Select', () => {
  it('renders all options', () => {
    render(<Select options={options} onChange={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Apple' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Banana' })).toBeInTheDocument();
  });

  it('derives the select id from the label', () => {
    render(<Select label="Fruit" options={options} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Fruit')).toHaveAttribute('id', 'fruit');
  });

  it('uses an explicit id when provided', () => {
    render(<Select id="custom" label="Ignored" options={options} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Ignored')).toHaveAttribute('id', 'custom');
  });

  it('does not render a label when omitted', () => {
    const { container } = render(<Select options={options} onChange={vi.fn()} />);
    expect(container.querySelector('label')).not.toBeInTheDocument();
  });

  it('shows an error message and applies the error border', () => {
    render(<Select label="Fruit" options={options} onChange={vi.fn()} error="Pick one" />);
    expect(screen.getByText('Pick one')).toBeInTheDocument();
    expect((screen.getByLabelText('Fruit') as unknown as HTMLSelectElement).className).toContain('border-error');
  });

  it('applies the neutral border when there is no error', () => {
    const { container } = render(<Select label="Fruit" options={options} onChange={vi.fn()} />);
    expect(container.querySelector('p.text-error')).not.toBeInTheDocument();
  });

  it('calls onChange with the selected value', () => {
    const onChange = vi.fn();
    render(<Select label="Fruit" options={options} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Fruit'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
