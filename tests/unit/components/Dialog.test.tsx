import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from '@/components/ui/Dialog';

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Dialog open={false} onOpenChange={vi.fn()} title="T">
        <p>body</p>
      </Dialog>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders title and children when open', () => {
    render(
      <Dialog open title="My Title" onOpenChange={vi.fn()}>
        <p>child content</p>
      </Dialog>
    );
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(
      <Dialog open title="T" description="Some description" onOpenChange={vi.fn()}>
        <p>x</p>
      </Dialog>
    );
    expect(screen.getByText('Some description')).toBeInTheDocument();
  });

  it('does not render a description element when omitted', () => {
    const { container } = render(
      <Dialog open title="T" onOpenChange={vi.fn()}>
        <p>x</p>
      </Dialog>
    );
    expect(container.querySelector('p.text-text-secondary')).not.toBeInTheDocument();
  });

  it('calls onOpenChange(false) when the overlay is clicked', () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open title="T" onOpenChange={onOpenChange}>
        <p>x</p>
      </Dialog>
    );
    const overlay = document.querySelector('.fixed.inset-0.bg-neutral-900\\/50') as HTMLElement;
    fireEvent.click(overlay);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('locks body scroll while open and restores on unmount', () => {
    const { unmount } = render(
      <Dialog open title="T" onOpenChange={vi.fn()}>
        <p>x</p>
      </Dialog>
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
