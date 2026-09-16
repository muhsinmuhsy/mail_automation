import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StarterGallery } from '@/components/templates/StarterGallery';
import { STARTERS } from '@/components/templates/starters/starterTemplates';

describe('StarterGallery', () => {
  it('renders the title "Choose a starting point"', () => {
    render(<StarterGallery onPick={vi.fn()} />);
    expect(screen.getByText('Choose a starting point')).toBeInTheDocument();
  });

  it('renders filter chips: All, Visual, Plain text', () => {
    render(<StarterGallery onPick={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Visual' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Plain text' })).toBeInTheDocument();
  });

  it('renders all 10 starter cards by default', () => {
    render(<StarterGallery onPick={vi.fn()} />);
    expect(screen.getAllByText('Start from scratch')).toHaveLength(2);
    expect(screen.getByText('Welcome email')).toBeInTheDocument();
    expect(screen.getByText('Newsletter')).toBeInTheDocument();
    expect(screen.getByText('Product announcement')).toBeInTheDocument();
    expect(screen.getByText('Event invitation')).toBeInTheDocument();
    expect(screen.getByText('Job application')).toBeInTheDocument();
    expect(screen.getByText('Welcome (plain)')).toBeInTheDocument();
    expect(screen.getByText('Receipt / confirmation')).toBeInTheDocument();
    expect(screen.getByText('Notification')).toBeInTheDocument();
  });

  it('filters to 6 visual starters when Visual is clicked', async () => {
    const user = userEvent.setup();
    render(<StarterGallery onPick={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Visual' }));
    expect(screen.getAllByText('Start from scratch')).toHaveLength(1);
    expect(screen.getByText('Welcome email')).toBeInTheDocument();
    expect(screen.getByText('Job application')).toBeInTheDocument();
    expect(screen.queryByText('Welcome (plain)')).not.toBeInTheDocument();
    expect(screen.queryByText('Notification')).not.toBeInTheDocument();
  });

  it('filters to 4 plaintext starters when Plain text is clicked', async () => {
    const user = userEvent.setup();
    render(<StarterGallery onPick={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'Plain text' }));
    expect(screen.getAllByText('Start from scratch')).toHaveLength(1);
    expect(screen.getByText('Welcome (plain)')).toBeInTheDocument();
    expect(screen.getByText('Notification')).toBeInTheDocument();
    expect(screen.queryByText('Welcome email')).not.toBeInTheDocument();
    expect(screen.queryByText('Newsletter')).not.toBeInTheDocument();
  });

  it('calls onPick with the starter when a card is clicked', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<StarterGallery onPick={onPick} />);
    await user.click(screen.getByText('Welcome email'));
    const welcome = STARTERS.find((s) => s.id === 'welcome-visual')!;
    expect(onPick).toHaveBeenCalledWith(welcome);
  });
});
