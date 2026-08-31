import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { DateTimePicker } from '@/components/ui/DateTimePicker';

describe('DateTimePicker', () => {
  it('renders a datetime-local input', () => {
    render(<DateTimePicker />);
    const input = screen.getByDisplayValue('') as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'datetime-local');
  });

  it('derives the input id from the label', () => {
    render(<DateTimePicker label="Start Time" />);
    expect(screen.getByLabelText('Start Time')).toHaveAttribute('id', 'start-time');
  });

  it('uses an explicit id when provided', () => {
    render(<DateTimePicker id="my-id" label="Ignored" />);
    expect(screen.getByLabelText('Ignored')).toHaveAttribute('id', 'my-id');
  });

  it('does not render a label when label is omitted', () => {
    const { container } = render(<DateTimePicker />);
    expect(container.querySelector('label')).not.toBeInTheDocument();
  });

  it('shows an error message and applies the error border', () => {
    render(<DateTimePicker label="When" error="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect((screen.getByLabelText('When') as HTMLInputElement).className).toContain('border-error');
  });

  it('applies the neutral border when there is no error', () => {
    const { container } = render(<DateTimePicker label="When" />);
    expect(container.querySelector('p.text-error')).not.toBeInTheDocument();
  });

  it('forwards a ref to the input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<DateTimePicker ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('passes through extra input props', () => {
    render(<DateTimePicker label="When" min="2020-01-01" />);
    expect((screen.getByLabelText('When') as HTMLInputElement)).toHaveAttribute('min', '2020-01-01');
  });
});
