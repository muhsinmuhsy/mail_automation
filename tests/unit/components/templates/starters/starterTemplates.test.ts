import { describe, it, expect } from 'vitest';
import { STARTERS, isBlankStarter } from '@/components/templates/starters/starterTemplates';

const MERGE_TAG_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

function extractMergeTags(text: string): string[] {
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = MERGE_TAG_PATTERN.exec(text)) !== null) {
    tags.push(match[1]);
  }
  MERGE_TAG_PATTERN.lastIndex = 0;
  return tags;
}

function starterText(starter: (typeof STARTERS)[number]): string {
  if (starter.format === 'visual') {
    return starter.subject + ' ' + JSON.stringify(starter.content);
  }
  return starter.subject + ' ' + starter.body;
}

describe('starterTemplates', () => {
  it('exports exactly 10 starters', () => {
    expect(STARTERS).toHaveLength(10);
  });

  it('has unique IDs', () => {
    const ids = STARTERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has 6 visual and 4 plaintext starters', () => {
    expect(STARTERS.filter((s) => s.format === 'visual')).toHaveLength(6);
    expect(STARTERS.filter((s) => s.format === 'plaintext')).toHaveLength(4);
  });

  it('all starters use only {{name}} and {{email}} merge tags', () => {
    for (const starter of STARTERS) {
      const tags = extractMergeTags(starterText(starter));
      for (const tag of tags) {
        expect(tag).toMatch(/^(name|email)$/);
      }
    }
  });

  it('non-blank visual starters have non-empty content and thumbnailHtml', () => {
    for (const starter of STARTERS) {
      if (isBlankStarter(starter) || starter.format !== 'visual') continue;
      expect(starter.content.blocks.length).toBeGreaterThan(0);
      expect(starter.thumbnailHtml).toBeTruthy();
    }
  });

  it('non-blank plaintext starters have non-empty body', () => {
    for (const starter of STARTERS) {
      if (isBlankStarter(starter) || starter.format !== 'plaintext') continue;
      expect(starter.body.length).toBeGreaterThan(0);
    }
  });

  it('blank starters have empty content/body, no thumbnailHtml, and empty subject', () => {
    for (const starter of STARTERS) {
      if (!isBlankStarter(starter)) continue;
      if (starter.format === 'visual') {
        expect(starter.content.blocks).toHaveLength(0);
        expect(starter.thumbnailHtml).toBeUndefined();
      } else {
        expect(starter.body).toBe('');
      }
      expect(starter.subject).toBe('');
    }
  });

  it('every starter has a subject string', () => {
    for (const starter of STARTERS) {
      expect(typeof starter.subject).toBe('string');
    }
  });
});
