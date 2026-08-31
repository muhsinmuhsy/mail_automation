import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { Input } from '@/components/ui/Input';

describe('Input', () => {
  it('renders an input', () => {
    render(<Input />);
    expect(screen.getByDisplayValue('')).toBeInstanceOf(HTMLInputElement);
  });

  it('derives the input id from the label', () => {
    render(<Input label="Email Address" />);
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('id', 'email-address');
  });

  it('uses an explicit id when provided', () => {
    render(<Input id="custom" label="Ignored" />);
    expect(screen.getByLabelText('Ignored')).toHaveAttribute('id', 'custom');
  });

  it('does not render a label when omitted', () => {
    const { container } = render(<Input />);
    expect(container.querySelector('label')).not.toBeInTheDocument();
  });

  it('shows an error message and applies the error border', () => {
    render(<Input label="Email" error="Invalid" />);
    expect(screen.getByText('Invalid')).toBeInTheDocument();
    expect((screen.getByLabelText('Email') as HTMLInputElement).className).toContain('border-error');
  });

  it('applies the neutral border when there is no error', () => {
    const { container } = render(<Input label="Email" />);
    expect(container.querySelector('p.text-error')).not.toBeInTheDocument();
  });

  it('forwards a ref to the input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('passes through extra input props', () => {
    render(<Input label="Email" placeholder="you@example.com" />);
    expect((screen.getByLabelText('Email') as HTMLInputElement)).toHaveAttribute('placeholder', 'you@example.com');
  });
});
