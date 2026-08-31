import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Alert } from '@/components/ui/Alert';

describe('Alert', () => {
  it('renders the message', () => {
    render(<Alert type="info" message="Heads up" />);
    expect(screen.getByText('Heads up')).toBeInTheDocument();
  });

  it('applies info variant styling', () => {
    const { container } = render(<Alert type="info" message="m" />);
    expect(container.firstChild).toHaveClass('bg-information-light');
  });

  it('applies warning variant styling', () => {
    const { container } = render(<Alert type="warning" message="m" />);
    expect(container.firstChild).toHaveClass('bg-warning-light');
  });

  it('applies error variant styling', () => {
    const { container } = render(<Alert type="error" message="m" />);
    expect(container.firstChild).toHaveClass('bg-error-light');
  });

  it('applies success variant styling', () => {
    const { container } = render(<Alert type="success" message="m" />);
    expect(container.firstChild).toHaveClass('bg-success-light');
  });

  it('does not render a dismiss button when onClose is omitted', () => {
    render(<Alert type="info" message="m" />);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('renders a dismiss button when onClose is provided', () => {
    const onClose = vi.fn();
    render(<Alert type="info" message="m" onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('calls onClose when the dismiss button is clicked', () => {
    const onClose = vi.fn();
    render(<Alert type="warning" message="m" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
