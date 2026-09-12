import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListToolbar } from '@/components/ui/ListToolbar';

describe('ListToolbar', () => {
  it('renders the search input with the provided value', () => {
    render(
      <ListToolbar
        search="alice"
        onSearchChange={vi.fn()}
        sortOrder="desc"
        onSortOrderChange={vi.fn()}
      />
    );
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('alice');
  });

  it('renders the sort select with the provided value', () => {
    render(
      <ListToolbar
        search=""
        onSearchChange={vi.fn()}
        sortOrder="asc"
        onSortOrderChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Sort')).toHaveValue('asc');
  });

  it('renders both sort options in the select', () => {
    render(
      <ListToolbar
        search=""
        onSearchChange={vi.fn()}
        sortOrder="desc"
        onSortOrderChange={vi.fn()}
      />
    );
    expect(screen.getByRole('option', { name: 'Newest first' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Oldest first' })).toBeInTheDocument();
  });

  it('calls onSearchChange when the search input changes', () => {
    const onSearchChange = vi.fn();
    render(
      <ListToolbar
        search=""
        onSearchChange={onSearchChange}
        sortOrder="desc"
        onSortOrderChange={vi.fn()}
      />
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'bob' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('bob');
  });

  it('calls onSortOrderChange when the sort selection changes', () => {
    const onSortOrderChange = vi.fn();
    render(
      <ListToolbar
        search=""
        onSearchChange={vi.fn()}
        sortOrder="desc"
        onSortOrderChange={onSortOrderChange}
      />
    );
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'asc' } });
    expect(onSortOrderChange).toHaveBeenCalledWith('asc');
  });

  it('renders children when provided', () => {
    render(
      <ListToolbar
        search=""
        onSearchChange={vi.fn()}
        sortOrder="desc"
        onSortOrderChange={vi.fn()}
      >
        <button type="button">Add contact</button>
      </ListToolbar>
    );
    expect(screen.getByRole('button', { name: 'Add contact' })).toBeInTheDocument();
  });

  it('does not render the children container when no children are given', () => {
    const { container } = render(
      <ListToolbar
        search=""
        onSearchChange={vi.fn()}
        sortOrder="desc"
        onSortOrderChange={vi.fn()}
      />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // The toolbar root should still render with its layout class
    expect(container.firstChild).toHaveClass('flex');
  });

  it('renders multiple children in the actions slot', () => {
    render(
      <ListToolbar
        search=""
        onSearchChange={vi.fn()}
        sortOrder="desc"
        onSortOrderChange={vi.fn()}
      >
        <button type="button">Import</button>
        <button type="button">Export</button>
      </ListToolbar>
    );
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('lays the toolbar out as a responsive row', () => {
    const { container } = render(
      <ListToolbar
        search=""
        onSearchChange={vi.fn()}
        sortOrder="desc"
        onSortOrderChange={vi.fn()}
      />
    );
    expect(container.firstChild).toHaveClass('flex', 'sm:flex-row', 'sm:justify-between');
  });

  it('does not render sort select when sortOrder is not provided', () => {
    render(
      <ListToolbar
        search=""
        onSearchChange={vi.fn()}
      />
    );
    expect(screen.queryByLabelText('Sort')).not.toBeInTheDocument();
  });

  it('renders filters slot when provided', () => {
    render(
      <ListToolbar
        search=""
        onSearchChange={vi.fn()}
        filters={<div data-testid="status-filter">Status</div>}
      />
    );
    expect(screen.getByTestId('status-filter')).toBeInTheDocument();
  });

  it('renders both search and filters without sort', () => {
    render(
      <ListToolbar
        search="test"
        onSearchChange={vi.fn()}
        filters={<select data-testid="my-filter"><option value="">All</option></select>}
      />
    );
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('test');
    expect(screen.getByTestId('my-filter')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sort')).not.toBeInTheDocument();
  });
});
