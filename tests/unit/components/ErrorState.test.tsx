import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from '@/components/ui/ErrorState';

describe('ErrorState', () => {
  it('renders the default title', () => {
    render(<ErrorState message="Boom" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders a custom title', () => {
    render(<ErrorState title="Failed to load" message="Boom" />);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
  });

  it('renders the message', () => {
    render(<ErrorState message="Connection lost" />);
    expect(screen.getByText('Connection lost')).toBeInTheDocument();
  });

  it('does not render a retry button when onRetry is omitted', () => {
    render(<ErrorState message="Boom" />);
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('renders a retry button and calls onRetry when clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Boom" onRetry={onRetry} />);
    const btn = screen.getByRole('button', { name: 'Try again' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
