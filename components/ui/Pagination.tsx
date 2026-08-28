'use client';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded-[var(--radius-md)] border border-neutral-200 px-3 py-1 text-sm disabled:opacity-50 text-text-primary hover:bg-selected"
      >
        Previous
      </button>
      <span className="text-sm text-text-secondary">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="rounded-[var(--radius-md)] border border-neutral-200 px-3 py-1 text-sm disabled:opacity-50 text-text-primary hover:bg-selected"
      >
        Next
      </button>
    </div>
  );
}
