import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/Badge';

describe('Badge', () => {
  it('renders children with the default variant', () => {
    render(<Badge>New</Badge>);
    const badge = screen.getByText('New');
    expect(badge).toBeInTheDocument();
    expect(badge.tagName).toBe('SPAN');
    expect(badge).toHaveClass('bg-selected');
  });

  it('renders the success variant', () => {
    const { container } = render(<Badge variant="success">ok</Badge>);
    expect(container.firstChild).toHaveClass('bg-success-light');
  });

  it('renders the warning variant', () => {
    const { container } = render(<Badge variant="warning">warn</Badge>);
    expect(container.firstChild).toHaveClass('bg-warning-light');
  });

  it('renders the error variant', () => {
    const { container } = render(<Badge variant="error">err</Badge>);
    expect(container.firstChild).toHaveClass('bg-error-light');
  });

  it('renders the information variant', () => {
    const { container } = render(<Badge variant="information">info</Badge>);
    expect(container.firstChild).toHaveClass('bg-information-light');
  });
});
