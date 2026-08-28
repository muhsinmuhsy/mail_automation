'use client';

interface Provider {
  id: string;
  name: string;
  icon: string;
}

const providers: Provider[] = [
  { id: 'gmail', name: 'Gmail', icon: '📧' },
  { id: 'microsoft', name: 'Microsoft', icon: '📨' },
  { id: 'yahoo', name: 'Yahoo', icon: '📩' },
  { id: 'custom_smtp', name: 'Custom SMTP', icon: '⚙️' },
];

interface ProviderSelectorProps {
  selected: string;
  onSelect: (providerId: string) => void;
}

export function ProviderSelector({ selected, onSelect }: ProviderSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {providers.map((provider) => (
        <button
          key={provider.id}
          onClick={() => onSelect(provider.id)}
          className={`flex items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium transition-colors ${
            selected === provider.id
              ? 'border-information bg-information-light text-information-text'
              : 'border-neutral-200 bg-background text-text-primary hover:bg-selected'
          }`}
        >
          <span className="text-lg">{provider.icon}</span>
          {provider.name}
        </button>
      ))}
    </div>
  );
}
