import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderSelector } from '@/components/email-accounts/ProviderSelector';

const PROVIDERS: Array<[string, string, string]> = [
  ['gmail', 'Gmail', 'G'],
  ['microsoft', 'Microsoft', 'M'],
  ['yahoo', 'Yahoo', 'Y'],
  ['custom_smtp', 'Custom SMTP', 'SMTP'],
];

describe('ProviderSelector', () => {
  it('renders a button for every provider', () => {
    render(<ProviderSelector selected="" onSelect={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(4);
    for (const [, name] of PROVIDERS) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it('renders each provider marker as decorative text', () => {
    render(<ProviderSelector selected="" onSelect={vi.fn()} />);
    for (const [, , marker] of PROVIDERS) {
      expect(screen.getByText(marker)).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('renders the providers in a responsive grid', () => {
    const { container } = render(<ProviderSelector selected="" onSelect={vi.fn()} />);
    expect(container.firstChild).toHaveClass('grid', 'grid-cols-1', 'sm:grid-cols-2', 'gap-3');
  });

  it('marks no provider as selected when the selection is empty', () => {
    render(<ProviderSelector selected="" onSelect={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('border-neutral-200');
      expect(button).not.toHaveClass('border-information');
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it.each(PROVIDERS)('highlights %s when it is the selected provider', (id, name) => {
    render(<ProviderSelector selected={id} onSelect={vi.fn()} />);
    const selected = screen.getByRole('button', { name: new RegExp(name) });
    expect(selected).toHaveClass('border-information', 'bg-information-light');
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    const others = screen
      .getAllByRole('button')
      .filter((b) => b !== selected);
    for (const other of others) {
      expect(other).toHaveClass('border-neutral-200');
    }
  });

  it.each(PROVIDERS)('calls onSelect with %s when clicked', async (id, name) => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ProviderSelector selected="" onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: new RegExp(name) }));
    expect(onSelect).toHaveBeenCalledWith(id);
  });

  it('calls onSelect again when the already-selected provider is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ProviderSelector selected="gmail" onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /Gmail/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('gmail');
  });

  it('moves the highlight when the selected prop changes', () => {
    const { rerender } = render(<ProviderSelector selected="gmail" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Gmail/ })).toHaveClass('border-information');
    rerender(<ProviderSelector selected="yahoo" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Gmail/ })).not.toHaveClass('border-information');
    expect(screen.getByRole('button', { name: /Yahoo/ })).toHaveClass('border-information');
  });

  it('ignores an unknown selected value', () => {
    render(<ProviderSelector selected="does-not-exist" onSelect={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toHaveClass('border-information');
    }
  });

  it('is keyboard operable via Enter and Space', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ProviderSelector selected="" onSelect={onSelect} />);
    await user.tab();
    expect(screen.getByRole('button', { name: /Gmail/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('gmail');
    await user.tab();
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenLastCalledWith('microsoft');
  });
});
