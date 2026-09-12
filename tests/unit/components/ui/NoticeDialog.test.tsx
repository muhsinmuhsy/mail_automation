import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoticeDialog } from '@/components/ui/NoticeDialog';

describe('NoticeDialog', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <NoticeDialog open={false} onOpenChange={vi.fn()} title="Notice" description="Something happened" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the title when open', () => {
    render(<NoticeDialog open onOpenChange={vi.fn()} title="Cannot delete" description="In use" />);
    expect(screen.getByRole('heading', { name: 'Cannot delete' })).toBeInTheDocument();
  });

  it('renders the description when open', () => {
    render(
      <NoticeDialog open onOpenChange={vi.fn()} title="Cannot delete" description="Used by 2 campaigns" />
    );
    expect(screen.getByText('Used by 2 campaigns')).toBeInTheDocument();
  });

  it('renders a default OK button', () => {
    render(<NoticeDialog open onOpenChange={vi.fn()} title="Notice" description="Msg" />);
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  it('renders a custom button label', () => {
    render(<NoticeDialog open onOpenChange={vi.fn()} title="Notice" description="Msg" buttonLabel="Got it" />);
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
  });

  it('calls onOpenChange with false when the OK button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<NoticeDialog open onOpenChange={onOpenChange} title="Notice" description="Msg" />);

    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders a close button inherited from Dialog', () => {
    render(<NoticeDialog open onOpenChange={vi.fn()} title="Notice" description="Msg" />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
