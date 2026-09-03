'use client';

interface Provider {
  id: string;
  name: string;
  marker: string;
}

const providers: Provider[] = [
  { id: 'gmail', name: 'Gmail', marker: 'G' },
  { id: 'microsoft', name: 'Microsoft', marker: 'M' },
  { id: 'yahoo', name: 'Yahoo', marker: 'Y' },
  { id: 'custom_smtp', name: 'Custom SMTP', marker: 'SMTP' },
];

interface ProviderSelectorProps {
  selected: string;
  onSelect: (providerId: string) => void;
}

export function ProviderSelector({ selected, onSelect }: ProviderSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {providers.map((provider) => {
        const isSelected = selected === provider.id;

        return (
          <button
            type="button"
            key={provider.id}
            onClick={() => onSelect(provider.id)}
            aria-pressed={isSelected}
            className={`flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left text-sm font-medium transition-colors ${
              isSelected
                ? 'border-information bg-information-light text-information-text'
                : 'border-neutral-200 bg-background text-text-primary hover:bg-selected'
            }`}
          >
            <span
              aria-hidden="true"
              className="flex h-8 min-w-8 items-center justify-center rounded-[var(--radius-sm)] bg-surface px-2 text-xs font-semibold text-text-primary"
            >
              {provider.marker}
            </span>
            <span>{provider.name}</span>
          </button>
        );
      })}
    </div>
  );
}
