import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('does not render a description when omitted', () => {
    const { container } = render(<EmptyState title="t" />);
    expect(container.querySelector('p.text-text-secondary')).not.toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<EmptyState title="t" description="Add something to begin." />);
    expect(screen.getByText('Add something to begin.')).toBeInTheDocument();
  });

  it('renders the action node when provided', () => {
    render(
      <EmptyState
        title="t"
        action={
          <button type="button" onClick={() => {}}>
            Create
          </button>
        }
      />
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('does not render an action node when omitted', () => {
    const { container } = render(<EmptyState title="t" />);
    expect(container.querySelector('div.mt-4')).not.toBeInTheDocument();
  });
});
