import type { TemplateContent } from '@templatical/types';
import { visualStarters, type VisualStarterSeed } from './visualStarters';
import { plaintextStarters, type PlaintextStarter } from './plaintextStarters';
import { starterThumbnails } from './starterThumbnails';

export interface VisualStarter {
  id: string;
  format: 'visual';
  name: string;
  description: string;
  subject: string;
  content: TemplateContent;
  thumbnailHtml?: string;
}

export type Starter = VisualStarter | PlaintextStarter;

export type StarterFormat = 'all' | 'visual' | 'plaintext';

function withThumbnails(seeds: VisualStarterSeed[]): VisualStarter[] {
  return seeds.map((seed) => ({
    ...seed,
    thumbnailHtml: starterThumbnails[seed.id],
  }));
}

export const STARTERS: Starter[] = [
  ...withThumbnails(visualStarters),
  ...plaintextStarters,
];

export function isBlankStarter(starter: Starter): boolean {
  return starter.id.startsWith('blank-');
}
