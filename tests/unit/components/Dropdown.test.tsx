import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dropdown } from '@/components/ui/Dropdown';

describe('Dropdown', () => {
  const items = [
    { label: 'Edit', onClick: vi.fn() },
    { label: 'Delete', onClick: vi.fn() },
  ];

  it('renders the trigger', () => {
    render(<Dropdown trigger={<button>Menu</button>} items={items} />);
    expect(screen.getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  });

  it('does not render the menu until opened', () => {
    render(<Dropdown trigger={<span>Menu</span>} items={items} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('opens the menu when the trigger is clicked', () => {
    render(<Dropdown trigger={<button>Menu</button>} items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('calls the item onClick and closes the menu', () => {
    const edit = vi.fn();
    const deleteFn = vi.fn();
    render(<Dropdown trigger={<button>Menu</button>} items={[{ label: 'Edit', onClick: edit }, { label: 'Delete', onClick: deleteFn }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(edit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('closes the menu when clicking outside', () => {
    render(<Dropdown trigger={<button>Menu</button>} items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('toggles closed when the trigger is clicked twice', () => {
    render(<Dropdown trigger={<button>Menu</button>} items={items} />);
    const trigger = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
