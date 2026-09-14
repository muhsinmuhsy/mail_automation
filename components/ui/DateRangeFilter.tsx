'use client';

import { Button } from './Button';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onClear: () => void;
  label?: string;
}

export function DateRangeFilter({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onClear,
  label = 'Date range',
}: DateRangeFilterProps) {
  const hasDates = startDate !== '' || endDate !== '';

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-text-primary">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          aria-label="Start date"
          value={startDate}
          onChange={(e) => onStartChange(e.target.value)}
          className="h-10 w-36 rounded-[var(--radius-md)] border border-neutral-200 bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-information focus:ring-offset-1"
        />
        <span className="text-sm text-text-secondary">–</span>
        <input
          type="date"
          aria-label="End date"
          value={endDate}
          onChange={(e) => onEndChange(e.target.value)}
          className="h-10 w-36 rounded-[var(--radius-md)] border border-neutral-200 bg-background px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-information focus:ring-offset-1"
        />
        {hasDates && (
          <Button variant="secondary" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
