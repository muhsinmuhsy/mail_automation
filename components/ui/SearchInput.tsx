'use client';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function SearchInput({ value, onChange, placeholder, label = 'Search' }: SearchInputProps) {
  return (
    <div className="relative">
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Search...'}
        className="h-10 w-full rounded-[var(--radius-md)] border border-neutral-200 bg-background pl-10 pr-4 text-sm text-text-primary"
      />
      <svg
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
  );
}
