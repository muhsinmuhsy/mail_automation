'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface SearchableSelectOption {
  value: string;
  label: string;
}

interface ApiResponseItem {
  id: string;
  name?: string;
  subject?: string;
  [key: string]: unknown;
}

interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface SearchableSelectProps {
  label?: string;
  value?: string;
  onChange?: (event: { target: { value: string; label?: string } }) => void;
  error?: string;
  id?: string;
  className?: string;
  required?: boolean;
  placeholder?: string;
  fetchUrl: string;
  pageSize?: number;
  selectedLabel?: string;
  mapItem?: (item: ApiResponseItem) => SearchableSelectOption;
  credentials?: RequestCredentials;
}

const DEFAULT_MAP: (item: ApiResponseItem) => SearchableSelectOption = (item) => ({
  value: item.id,
  label: item.name ?? item.id,
});

export function SearchableSelect({
  label,
  value,
  onChange,
  error,
  id,
  className,
  required,
  placeholder,
  fetchUrl,
  pageSize = 10,
  selectedLabel,
  mapItem = DEFAULT_MAP,
  credentials = 'include',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<SearchableSelectOption[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [hasFetched, setHasFetched] = useState(false);

  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef(mapItem);
  useEffect(() => { mapRef.current = mapItem; });

  const selectId = id || label?.toLowerCase().replace(/\s/g, '-');

  const displayLabel = useMemo(() => {
    if (value) {
      const found = options.find((opt) => opt.value === value);
      if (found) return found.label;
      if (selectedLabel) return selectedLabel;
    }
    return placeholder || '';
  }, [value, options, selectedLabel, placeholder]);

  const fetchPage = useCallback(async (pageNum: number, searchTerm: string, append: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (append) setLoadingMore(true);
    else setLoading(true);

    const params = new URLSearchParams({
      page: String(pageNum),
      limit: String(pageSize),
    });
    if (searchTerm.trim()) params.set('search', searchTerm.trim());

    try {
      const res = await fetch(`${fetchUrl}?${params.toString()}`, {
        credentials,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const body = (await res.json()) as {
        success: boolean;
        data?: ApiResponseItem[];
        pagination?: PaginationMeta;
      };
      if (!body.success || !body.data) return;

      const mapped = body.data.map(mapRef.current);
      setOptions((prev) => (append ? [...prev, ...mapped] : mapped));
      setPage(pageNum);
      setTotalPages(body.pagination?.totalPages ?? 1);
      setHasFetched(true);
    } catch {
      // aborted or network error — leave existing options
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [fetchUrl, pageSize, credentials]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchPage(1, search, false);
      setHighlightedIndex(-1);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, search, fetchPage]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && searchInputRef.current) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleSelect = useCallback(
    (selectedValue: string) => {
      const selected = options.find((opt) => opt.value === selectedValue);
      onChange?.({ target: { value: selectedValue, label: selected?.label } });
      setOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange, options]
  );

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || loading || loadingMore || page >= totalPages) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (nearBottom) {
      void fetchPage(page + 1, search, true);
    }
  }, [loading, loadingMore, page, totalPages, search, fetchPage]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          handleSelect(options[highlightedIndex].value);
        }
        break;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        setHighlightedIndex(-1);
        break;
      case 'Tab':
        setOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const showLoading = loading && !hasFetched;
  const showEmpty = hasFetched && !loading && options.length === 0;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-text-primary">
          {label}{required && <span className="text-error"> *</span>}
        </label>
      )}
      <div ref={ref} className="relative">
        <button
          id={selectId}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? `${selectId}-listbox` : undefined}
          aria-label={label}
          onClick={() => setOpen(!open)}
          onKeyDown={handleKeyDown}
          className={[
            'flex h-10 w-full items-center justify-between rounded-[var(--radius-md)] border bg-background px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-information focus:ring-offset-1',
            error ? 'border-error' : 'border-neutral-200',
            className || '',
          ].join(' ')}
        >
          <span className={displayLabel ? 'text-text-primary' : 'text-text-secondary'}>
            {displayLabel || placeholder || 'Select...'}
          </span>
          <svg
            className={`h-4 w-4 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div
            id={`${selectId}-listbox`}
            role="listbox"
            className="absolute left-0 right-0 mt-2 rounded-[var(--radius-md)] border border-neutral-200 bg-background shadow-[var(--shadow-elevated)] z-50"
          >
            <div className="p-2 border-b border-neutral-200">
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="flex h-8 w-full rounded-[var(--radius-sm)] border border-neutral-200 bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-information"
                aria-label={`Search ${label || 'options'}`}
              />
            </div>
            <div
              ref={listRef}
              onScroll={handleScroll}
              className="max-h-48 overflow-y-auto py-1"
            >
              {showLoading && (
                <div className="flex items-center justify-center py-4">
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    role="status"
                    aria-label="Loading"
                  />
                </div>
              )}
              {showEmpty && (
                <div className="px-4 py-3 text-sm text-text-secondary">No results found.</div>
              )}
              {!showLoading && !showEmpty && options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={[
                    'block w-full text-left px-4 py-2 text-sm',
                    highlightedIndex === index ? 'bg-selected' : '',
                    option.value === value ? 'font-medium text-text-primary' : 'text-text-primary',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
              {loadingMore && (
                <div className="flex items-center justify-center py-2">
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    role="status"
                    aria-label="Loading more"
                  />
                </div>
              )}
            </div>
            {!showLoading && !showEmpty && page < totalPages && (
              <div className="border-t border-neutral-200 px-4 py-1.5 text-caption text-text-secondary">
                Showing {options.length} of {totalPages * pageSize}+ results — scroll for more
              </div>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
