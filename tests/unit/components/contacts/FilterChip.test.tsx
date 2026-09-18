import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChip } from '@/components/contacts/FilterChip';

describe('FilterChip', () => {
  it('renders the label', () => {
    render(<FilterChip label="Role contains manager" onRemove={vi.fn()} />);
    expect(screen.getByText('Role contains manager')).toBeInTheDocument();
  });

  it('calls onRemove when the remove button is clicked', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<FilterChip label="Score > 100" onRemove={onRemove} />);

    await user.click(screen.getByRole('button', { name: 'Remove filter Score > 100' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
