'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value?: string;
  onChange?: (event: { target: { value: string } }) => void;
  error?: string;
  id?: string;
  className?: string;
  required?: boolean;
  placeholder?: string;
}

export function Select({ label, options, value, onChange, error, id, className, required, placeholder }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const selectId = id || label?.toLowerCase().replace(/\s/g, '-');

  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption?.label || placeholder || options[0]?.label || '';

  const handleSelect = useCallback(
    (selectedValue: string) => {
      onChange?.({ target: { value: selectedValue } });
      setOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange]
  );

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

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex(options.findIndex((opt) => opt.value === value));
      return;
    }
    if (!open) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % options.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length);
        break;
      case 'Enter':
        event.preventDefault();
        if (highlightedIndex >= 0) {
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
          <span className={selectedOption ? 'text-text-primary' : 'text-text-secondary'}>{displayLabel}</span>
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
            role="listbox"
            className="absolute left-0 right-0 mt-2 rounded-[var(--radius-md)] border border-neutral-200 bg-background py-1 shadow-[var(--shadow-elevated)] z-50 max-h-60 overflow-y-auto"
          >
            {options.map((option, index) => (
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
          </div>
        )}
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
