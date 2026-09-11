'use client';

import { SearchInput } from './SearchInput';
import { SortSelect } from './SortSelect';

interface ListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortOrder: 'desc' | 'asc';
  onSortOrderChange: (value: 'desc' | 'asc') => void;
  children?: React.ReactNode;
}

export function ListToolbar({ search, onSearchChange, sortOrder, onSortOrderChange, children }: ListToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:w-64">
          <SearchInput value={search} onChange={onSearchChange} />
        </div>
        <SortSelect value={sortOrder} onChange={onSortOrderChange} />
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
