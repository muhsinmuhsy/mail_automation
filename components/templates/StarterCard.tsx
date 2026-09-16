'use client';

import { Badge } from '@/components/ui/Badge';
import type { Starter } from './starters/starterTemplates';
import { isBlankStarter } from './starters/starterTemplates';

interface StarterCardProps {
  starter: Starter;
  onPick: (starter: Starter) => void;
}

export function StarterCard({ starter, onPick }: StarterCardProps) {
  const blank = isBlankStarter(starter);

  if (blank) {
    return (
      <button
        type="button"
        onClick={() => onPick(starter)}
        className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-neutral-300 bg-background p-4 text-center transition-colors hover:bg-selected"
      >
        <span className="text-2xl text-text-secondary">+</span>
        <span className="font-medium text-text-primary">{starter.name}</span>
        <Badge variant="default">{starter.format === 'visual' ? 'Visual' : 'Plain text'}</Badge>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPick(starter)}
      className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4 text-left transition-colors hover:bg-selected"
    >
      {starter.format === 'visual' && starter.thumbnailHtml ? (
        <iframe
          srcDoc={starter.thumbnailHtml}
          sandbox=""
          title={starter.name}
          className="h-32 w-full rounded-[var(--radius-sm)] border border-neutral-200"
        />
      ) : starter.format === 'plaintext' ? (
        <div className="h-32 w-full overflow-hidden rounded-[var(--radius-sm)] border border-neutral-200 bg-selected p-3">
          <pre className="whitespace-pre-wrap font-mono text-xs text-text-secondary line-clamp-6">
            {starter.body}
          </pre>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-text-primary">{starter.name}</span>
        <Badge variant={starter.format === 'visual' ? 'information' : 'default'}>
          {starter.format === 'visual' ? 'Visual' : 'Plain text'}
        </Badge>
      </div>
      <p className="text-sm text-text-secondary">{starter.description}</p>
    </button>
  );
}
