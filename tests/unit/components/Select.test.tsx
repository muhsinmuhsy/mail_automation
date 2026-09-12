import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from '@/components/ui/Select';

const options = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
];

describe('Select', () => {
  it('renders the trigger button with a combobox role', () => {
    render(<Select label="Fruit" options={options} onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Fruit' })).toBeInTheDocument();
  });

  it('shows the label text', () => {
    render(<Select label="Fruit" options={options} onChange={vi.fn()} />);
    expect(screen.getByText('Fruit')).toBeInTheDocument();
  });

  it('does not render a label when omitted', () => {
    const { container } = render(<Select options={options} onChange={vi.fn()} />);
    expect(container.querySelector('label')).not.toBeInTheDocument();
  });

  it('opens the dropdown when clicked and shows all options', () => {
    render(<Select label="Fruit" options={options} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Fruit' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Apple' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Banana' })).toBeInTheDocument();
  });

  it('shows an error message when error prop is provided', () => {
    render(<Select label="Fruit" options={options} onChange={vi.fn()} error="Pick one" />);
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('applies the error border class when error is present', () => {
    render(<Select label="Fruit" options={options} onChange={vi.fn()} error="Pick one" />);
    expect(screen.getByRole('combobox', { name: 'Fruit' }).className).toContain('border-error');
  });

  it('does not show error text when no error', () => {
    const { container } = render(<Select label="Fruit" options={options} onChange={vi.fn()} />);
    expect(container.querySelector('p.text-error')).not.toBeInTheDocument();
  });

  it('calls onChange with the selected value when an option is clicked', () => {
    const onChange = vi.fn();
    render(<Select label="Fruit" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Fruit' }));
    fireEvent.click(screen.getByRole('option', { name: 'Banana' }));
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'b' } });
  });

  it('displays the selected option label in the trigger', () => {
    render(<Select label="Fruit" options={options} value="b" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Fruit' })).toHaveTextContent('Banana');
  });

  it('closes the dropdown after selecting an option', () => {
    render(<Select label="Fruit" options={options} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Fruit' }));
    fireEvent.click(screen.getByRole('option', { name: 'Apple' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('marks the selected option with aria-selected', () => {
    render(<Select label="Fruit" options={options} value="b" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Fruit' }));
    expect(screen.getByRole('option', { name: 'Banana' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'false');
  });

  it('closes the dropdown on Escape key', () => {
    render(<Select label="Fruit" options={options} onChange={vi.fn()} />);
    const combobox = screen.getByRole('combobox', { name: 'Fruit' });
    fireEvent.click(combobox);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(combobox, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens the dropdown on ArrowDown key', () => {
    render(<Select label="Fruit" options={options} onChange={vi.fn()} />);
    const combobox = screen.getByRole('combobox', { name: 'Fruit' });
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('shows a required indicator when required prop is set', () => {
    render(<Select label="Fruit" options={options} onChange={vi.fn()} required />);
    expect(screen.getByText('*')).toBeInTheDocument();
  });
});
