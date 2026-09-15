'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface TimezoneSelectProps {
  label?: string;
  value?: string;
  onChange?: (event: { target: { value: string } }) => void;
  error?: string;
  id?: string;
  className?: string;
  required?: boolean;
}

function getAllTimezones(): string[] {
  try {
    if (typeof Intl !== 'undefined' && typeof (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf === 'function') {
      const list = (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone');
      if (list.length > 0) return list;
    }
  } catch {
    // fall through to hardcoded list
  }
  return FALLBACK_TIMEZONES;
}

function timezoneLabel(tz: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(now);
    const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    const offset = raw.replace('GMT', '');
    const offsetStr = offset === '' || offset === '+0' || offset === '-0' ? 'UTC' : `UTC${offset}`;
    return `${tz} (${offsetStr})`;
  } catch {
    return tz;
  }
}

const FALLBACK_TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'America/Phoenix',
  'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Brussels',
  'Europe/Vienna', 'Europe/Zurich', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Helsinki',
  'Europe/Warsaw', 'Europe/Prague', 'Europe/Budapest', 'Europe/Athens', 'Europe/Istanbul', 'Europe/Moscow',
  'Europe/Dublin', 'Europe/Lisbon',
  'Asia/Calcutta', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Manila', 'Asia/Singapore',
  'Asia/Kuala_Lumpur', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Beijing',
  'Asia/Dubai', 'Asia/Tehran', 'Asia/Baghdad', 'Asia/Riyadh', 'Asia/Kolkata', 'Asia/Chongqing', 'Asia/Urumqi',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth', 'Australia/Adelaide',
  'Pacific/Auckland', 'Pacific/Honolulu', 'Pacific/Fiji',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Casablanca', 'Africa/Accra',
];

const PAGE_SIZE = 50;

export function TimezoneSelect({
  label,
  value,
  onChange,
  error,
  id,
  className,
  required,
}: TimezoneSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectId = id || label?.toLowerCase().replace(/\s/g, '-');

  const allTimezones = useMemo(() => getAllTimezones(), []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allTimezones;
    return allTimezones.filter((tz) => tz.toLowerCase().includes(q));
  }, [allTimezones, search]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const displayLabel = useMemo(() => {
    if (!value) return '';
    return timezoneLabel(value);
  }, [value]);

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

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setVisibleCount(PAGE_SIZE);
    setHighlightedIndex(-1);
  };

  const handleSelect = useCallback(
    (selectedValue: string) => {
      onChange?.({ target: { value: selectedValue } });
      setOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange]
  );

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 40 && visibleCount < filtered.length) {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length));
    }
  }, [visibleCount, filtered.length]);

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
        setHighlightedIndex((prev) => Math.min(prev + 1, visible.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < visible.length) {
          handleSelect(visible[highlightedIndex]);
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
            {displayLabel || 'Select timezone'}
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
                onChange={handleSearchChange}
                placeholder="Search timezone (e.g. Asia, New_York, UTC)..."
                className="flex h-8 w-full rounded-[var(--radius-sm)] border border-neutral-200 bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-information"
                aria-label={`Search ${label || 'timezone'}`}
              />
            </div>
            <div
              ref={listRef}
              onScroll={handleScroll}
              className="max-h-60 overflow-y-auto py-1"
            >
              {visible.length === 0 && (
                <div className="px-4 py-3 text-sm text-text-secondary">No timezones found.</div>
              )}
              {visible.map((tz, index) => {
                const lbl = timezoneLabel(tz);
                return (
                  <button
                    key={tz}
                    type="button"
                    role="option"
                    aria-selected={tz === value}
                    onClick={() => handleSelect(tz)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={[
                      'block w-full text-left px-4 py-2 text-sm',
                      highlightedIndex === index ? 'bg-selected' : '',
                      tz === value ? 'font-medium text-text-primary' : 'text-text-primary',
                    ].join(' ')}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
            {visibleCount < filtered.length && (
              <div className="border-t border-neutral-200 px-4 py-1.5 text-caption text-text-secondary">
                Showing {visible.length} of {filtered.length} — scroll for more
              </div>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
