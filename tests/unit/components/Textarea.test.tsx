import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { Textarea } from '@/components/ui/Textarea';

describe('Textarea', () => {
  it('renders a textarea', () => {
    render(<Textarea />);
    expect(screen.getByDisplayValue('')).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('derives the textarea id from the label', () => {
    render(<Textarea label="Notes" />);
    expect(screen.getByLabelText('Notes')).toHaveAttribute('id', 'notes');
  });

  it('uses an explicit id when provided', () => {
    render(<Textarea id="custom" label="Ignored" />);
    expect(screen.getByLabelText('Ignored')).toHaveAttribute('id', 'custom');
  });

  it('does not render a label when omitted', () => {
    const { container } = render(<Textarea />);
    expect(container.querySelector('label')).not.toBeInTheDocument();
  });

  it('shows an error message and applies the error border', () => {
    render(<Textarea label="Notes" error="Required" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).className).toContain('border-error');
  });

  it('applies the neutral border when there is no error', () => {
    const { container } = render(<Textarea label="Notes" />);
    expect(container.querySelector('p.text-error')).not.toBeInTheDocument();
  });

  it('forwards a ref to the textarea element', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('passes through extra textarea props', () => {
    render(<Textarea label="Notes" placeholder="Type here" />);
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement)).toHaveAttribute('placeholder', 'Type here');
  });
});
