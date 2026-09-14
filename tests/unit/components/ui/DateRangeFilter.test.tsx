import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateRangeFilter } from '@/components/ui/DateRangeFilter';

describe('DateRangeFilter', () => {
  it('renders two date inputs with labels', () => {
    render(
      <DateRangeFilter
        startDate=""
        endDate=""
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
    expect(screen.getByText('Date range')).toBeInTheDocument();
  });

  it('calls onStartChange when start date changes', async () => {
    const user = userEvent.setup();
    const onStartChange = vi.fn();
    render(
      <DateRangeFilter
        startDate=""
        endDate=""
        onStartChange={onStartChange}
        onEndChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    await user.type(screen.getByLabelText('Start date'), '2026-09-01');
    expect(onStartChange).toHaveBeenCalled();
  });

  it('calls onEndChange when end date changes', async () => {
    const user = userEvent.setup();
    const onEndChange = vi.fn();
    render(
      <DateRangeFilter
        startDate=""
        endDate=""
        onStartChange={vi.fn()}
        onEndChange={onEndChange}
        onClear={vi.fn()}
      />
    );
    await user.type(screen.getByLabelText('End date'), '2026-09-30');
    expect(onEndChange).toHaveBeenCalled();
  });

  it('shows Clear button when start date is set', () => {
    render(
      <DateRangeFilter
        startDate="2026-09-01"
        endDate=""
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('shows Clear button when end date is set', () => {
    render(
      <DateRangeFilter
        startDate=""
        endDate="2026-09-30"
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('hides Clear button when both dates are empty', () => {
    render(
      <DateRangeFilter
        startDate=""
        endDate=""
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        onClear={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('calls onClear when Clear button is clicked', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <DateRangeFilter
        startDate="2026-09-01"
        endDate="2026-09-30"
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        onClear={onClear}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('renders custom label when provided', () => {
    render(
      <DateRangeFilter
        startDate=""
        endDate=""
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        onClear={vi.fn()}
        label="Created between"
      />
    );
    expect(screen.getByText('Created between')).toBeInTheDocument();
  });
});
