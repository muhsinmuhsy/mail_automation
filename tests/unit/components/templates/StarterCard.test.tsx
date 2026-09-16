import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StarterCard } from '@/components/templates/StarterCard';
import { STARTERS } from '@/components/templates/starters/starterTemplates';

function find(id: string) {
  const starter = STARTERS.find((s) => s.id === id);
  if (!starter) throw new Error(`Starter ${id} not found`);
  return starter;
}

describe('StarterCard', () => {
  it('renders a blank visual card with "Start from scratch" and Visual badge', () => {
    render(<StarterCard starter={find('blank-visual')} onPick={vi.fn()} />);
    expect(screen.getByText('Start from scratch')).toBeInTheDocument();
    expect(screen.getByText('Visual')).toBeInTheDocument();
  });

  it('renders a blank plaintext card with "Start from scratch" and Plain text badge', () => {
    render(<StarterCard starter={find('blank-plaintext')} onPick={vi.fn()} />);
    expect(screen.getByText('Start from scratch')).toBeInTheDocument();
    expect(screen.getByText('Plain text')).toBeInTheDocument();
  });

  it('renders a preset visual card with name, description, and format badge', () => {
    render(<StarterCard starter={find('welcome-visual')} onPick={vi.fn()} />);
    expect(screen.getByText('Welcome email')).toBeInTheDocument();
    expect(screen.getByText('Greet new subscribers')).toBeInTheDocument();
    expect(screen.getByText('Visual')).toBeInTheDocument();
  });

  it('renders a preset plaintext card with name, description, and format badge', () => {
    render(<StarterCard starter={find('welcome-plaintext')} onPick={vi.fn()} />);
    expect(screen.getByText('Welcome (plain)')).toBeInTheDocument();
    expect(screen.getByText('Simple greeting')).toBeInTheDocument();
    expect(screen.getByText('Plain text')).toBeInTheDocument();
  });

  it('calls onPick with the starter when a preset card is clicked', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const starter = find('welcome-visual');
    render(<StarterCard starter={starter} onPick={onPick} />);
    await user.click(screen.getByText('Welcome email'));
    expect(onPick).toHaveBeenCalledWith(starter);
  });

  it('calls onPick when a blank card is clicked', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const starter = find('blank-plaintext');
    render(<StarterCard starter={starter} onPick={onPick} />);
    await user.click(screen.getByText('Start from scratch'));
    expect(onPick).toHaveBeenCalledWith(starter);
  });
});
