import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormMessage } from '@/components/ui/FormMessage';

describe('FormMessage', () => {
  it('renders a success message', () => {
    const { container } = render(<FormMessage type="success" message="Saved" />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('bg-success-light');
  });

  it('renders an error message', () => {
    const { container } = render(<FormMessage type="error" message="Bad" />);
    expect(container.firstChild).toHaveClass('bg-error-light');
  });

  it('renders an info message', () => {
    const { container } = render(<FormMessage type="info" message="Heads up" />);
    expect(container.firstChild).toHaveClass('bg-information-light');
  });

  it('renders a warning message', () => {
    const { container } = render(<FormMessage type="warning" message="Careful" />);
    expect(container.firstChild).toHaveClass('bg-warning-light');
  });
});
