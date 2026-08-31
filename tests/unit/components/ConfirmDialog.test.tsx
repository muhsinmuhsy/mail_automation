import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ConfirmDialog open={false} onOpenChange={vi.fn()} title="T" description="D" onConfirm={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders title and description when open', () => {
    render(<ConfirmDialog open onOpenChange={vi.fn()} title="Delete?" description="Sure?" onConfirm={vi.fn()} />);
    expect(screen.getByText('Delete?')).toBeInTheDocument();
    expect(screen.getByText('Sure?')).toBeInTheDocument();
  });

  it('uses default labels Confirm/Cancel', () => {
    render(<ConfirmDialog open onOpenChange={vi.fn()} title="T" description="D" onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('uses custom labels', () => {
    render(
      <ConfirmDialog open onOpenChange={vi.fn()} title="T" description="D" confirmLabel="Yes" cancelLabel="No" onConfirm={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when cancel is clicked', () => {
    const onOpenChange = vi.fn();
    render(<ConfirmDialog open onOpenChange={onOpenChange} title="T" description="D" onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onConfirm when confirm is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open onOpenChange={vi.fn()} title="T" description="D" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('uses the destructive variant for the confirm button', () => {
    render(
      <ConfirmDialog open onOpenChange={vi.fn()} title="T" description="D" variant="destructive" onConfirm={vi.fn()} />
    );
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toHaveClass('bg-error');
  });

  it('disables both buttons while loading', () => {
    render(<ConfirmDialog open onOpenChange={vi.fn()} title="T" description="D" loading onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
