import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from '@/components/ui/Dialog';

describe('Dialog', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <Dialog open={false} onOpenChange={vi.fn()} title="Test dialog">Content</Dialog>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the title when open', () => {
    render(<Dialog open onOpenChange={vi.fn()} title="Test dialog">Content</Dialog>);
    expect(screen.getByRole('heading', { name: 'Test dialog' })).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(
      <Dialog open onOpenChange={vi.fn()} title="Test dialog" description="A description">
        Content
      </Dialog>
    );
    expect(screen.getByText('A description')).toBeInTheDocument();
  });

  it('renders children when open', () => {
    render(<Dialog open onOpenChange={vi.fn()} title="Test dialog">Child content</Dialog>);
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    render(<Dialog open onOpenChange={vi.fn()} title="Test dialog">Content</Dialog>);
    expect(screen.queryByText('A description')).not.toBeInTheDocument();
  });

  describe('close button', () => {
    it('renders a close button with aria-label', () => {
      render(<Dialog open onOpenChange={vi.fn()} title="Test dialog">Content</Dialog>);
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('calls onOpenChange with false when the close button is clicked', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<Dialog open onOpenChange={onOpenChange} title="Test dialog">Content</Dialog>);

      await user.click(screen.getByRole('button', { name: 'Close' }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('backdrop click', () => {
    it('calls onOpenChange with false when the backdrop is clicked', () => {
      const onOpenChange = vi.fn();
      const { container } = render(
        <Dialog open onOpenChange={onOpenChange} title="Test dialog">Content</Dialog>
      );
      const backdrop = container.querySelector('.fixed.inset-0.bg-neutral-900\\/50') as HTMLElement;
      backdrop.click();

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
