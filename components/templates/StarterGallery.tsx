'use client';

import { useState } from 'react';
import { StarterCard } from './StarterCard';
import { STARTERS, type Starter, type StarterFormat } from './starters/starterTemplates';

interface StarterGalleryProps {
  onPick: (starter: Starter) => void;
}

const FILTERS: { label: string; value: StarterFormat }[] = [
  { label: 'All', value: 'all' },
  { label: 'Visual', value: 'visual' },
  { label: 'Plain text', value: 'plaintext' },
];

export function StarterGallery({ onPick }: StarterGalleryProps) {
  const [filter, setFilter] = useState<StarterFormat>('all');

  const visible = filter === 'all'
    ? STARTERS
    : STARTERS.filter((s) => s.format === filter);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="px-6 pt-4">
        <h2 className="text-lg font-semibold text-text-primary">Choose a starting point</h2>
        <div role="tablist" aria-label="Starter format filter" className="mt-3 flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium ${
                filter === f.value
                  ? 'bg-information text-white'
                  : 'text-text-secondary hover:bg-selected'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((starter) => (
            <StarterCard key={starter.id} starter={starter} onPick={onPick} />
          ))}
        </div>
      </div>
    </div>
  );
}
