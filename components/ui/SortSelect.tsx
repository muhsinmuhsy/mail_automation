'use client';

import { Select } from './Select';

interface SortSelectProps {
  value: 'desc' | 'asc';
  onChange: (value: 'desc' | 'asc') => void;
  label?: string;
}

export function SortSelect({ value, onChange, label = 'Sort' }: SortSelectProps) {
  return (
    <div className="w-44">
      <Select
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as 'desc' | 'asc')}
        options={[
          { value: 'desc', label: 'Newest first' },
          { value: 'asc', label: 'Oldest first' },
        ]}
      />
    </div>
  );
}
