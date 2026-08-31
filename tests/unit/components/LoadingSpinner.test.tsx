import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders a status element with an aria-label', () => {
    render(<LoadingSpinner />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Loading');
  });

  it('uses the medium size by default', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('span')).toHaveClass('h-8');
  });

  it('uses the small size', () => {
    const { container } = render(<LoadingSpinner size="sm" />);
    expect(container.querySelector('span')).toHaveClass('h-4');
  });

  it('uses the large size', () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    expect(container.querySelector('span')).toHaveClass('h-12');
  });
});
