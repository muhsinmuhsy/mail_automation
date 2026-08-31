import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('uses the primary variant by default', () => {
    const { container } = render(<Button>x</Button>);
    expect(container.firstChild).toHaveClass('bg-information');
  });

  it('applies the secondary variant', () => {
    const { container } = render(<Button variant="secondary">x</Button>);
    expect(container.firstChild).toHaveClass('bg-surface');
  });

  it('applies the destructive variant', () => {
    const { container } = render(<Button variant="destructive">x</Button>);
    expect(container.firstChild).toHaveClass('bg-error');
  });

  it('applies the small size', () => {
    const { container } = render(<Button size="sm">x</Button>);
    expect(container.firstChild).toHaveClass('h-8');
  });

  it('applies the large size', () => {
    const { container } = render(<Button size="lg">x</Button>);
    expect(container.firstChild).toHaveClass('h-12');
  });

  it('merges a custom className', () => {
    const { container } = render(<Button className="custom-class">x</Button>);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>nope</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows a spinner and is disabled while loading', () => {
    render(<Button loading>save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.querySelector('span')).toBeInTheDocument();
  });

  it('renders both a spinner and children when loading', () => {
    render(<Button loading>save</Button>);
    expect(screen.getByText('save')).toBeInTheDocument();
  });

  it('forwards a ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>x</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
