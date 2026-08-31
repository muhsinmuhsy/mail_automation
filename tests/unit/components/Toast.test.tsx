import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Toast } from '@/components/ui/Toast';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the message', () => {
    render(<Toast message="Saved successfully" />);
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
  });

  it('uses the information type by default', () => {
    const { container } = render(<Toast message="info" />);
    expect(container.firstChild).toHaveClass('bg-information-light');
  });

  it('renders the success type', () => {
    const { container } = render(<Toast message="ok" type="success" />);
    expect(container.firstChild).toHaveClass('bg-success-light');
  });

  it('renders the error type', () => {
    const { container } = render(<Toast message="err" type="error" />);
    expect(container.firstChild).toHaveClass('bg-error-light');
  });

  it('renders the warning type', () => {
    const { container } = render(<Toast message="warn" type="warning" />);
    expect(container.firstChild).toHaveClass('bg-warning-light');
  });

  it('calls onClose and disappears after 5 seconds', () => {
    const onClose = vi.fn();
    const { container } = render(<Toast message="bye" onClose={onClose} />);
    expect(container.firstChild).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container).toBeEmptyDOMElement();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onClose is omitted after the timeout', () => {
    const { container } = render(<Toast message="bye" />);
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(5000);
      });
    }).not.toThrow();
    expect(container).toBeEmptyDOMElement();
  });
});
