import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '@/components/ui/PageHeader';

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="Campaigns" />);
    expect(screen.getByText('Campaigns')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<PageHeader title="Campaigns" description="Create and manage campaigns." />);
    expect(screen.getByText('Create and manage campaigns.')).toBeInTheDocument();
  });

  it('does not render description when omitted', () => {
    const { container } = render(<PageHeader title="Campaigns" />);
    expect(container.querySelector('p')).not.toBeInTheDocument();
  });

  it('renders action buttons when provided', () => {
    render(
      <PageHeader title="Campaigns" actions={<button type="button">Create</button>} />
    );
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('does not render actions container when omitted', () => {
    render(<PageHeader title="Campaigns" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders multiple action buttons', () => {
    render(
      <PageHeader
        title="Contacts"
        actions={
          <>
            <button type="button">Add</button>
            <button type="button">Import</button>
          </>
        }
      />
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
  });

  it('uses the page-title text size class', () => {
    render(<PageHeader title="Campaigns" />);
    expect(screen.getByText('Campaigns')).toHaveClass('text-page-title', 'font-semibold');
  });

  it('lays out as a responsive row with space-between', () => {
    const { container } = render(<PageHeader title="Campaigns" />);
    expect(container.firstChild).toHaveClass('flex', 'sm:flex-row', 'sm:justify-between');
  });
});
