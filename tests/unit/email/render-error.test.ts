import { describe, it, expect } from 'vitest';
import { renderTemplate } from '@/lib/email/render';
import { createMergeTagFixture } from '@/tests/fixtures/template-content';

describe('lib/email/render (error paths)', () => {
  it('throws on malformed JSON', async () => {
    await expect(renderTemplate('not-json')).rejects.toThrow(/not valid JSON/i);
  });

  it('throws on JSON that is not a valid TemplateContent shape', async () => {
    await expect(renderTemplate(JSON.stringify({ foo: 'bar' }))).rejects.toThrow(
      /invalid template content/i
    );
  });

  it('throws when blocks is not an array', async () => {
    await expect(
      renderTemplate(JSON.stringify({ blocks: 'not-array', settings: {} }))
    ).rejects.toThrow(/invalid template content/i);
  });

  it('throws when settings is missing required fields', async () => {
    const valid = createMergeTagFixture();
    const invalid = {
      ...valid,
      settings: { ...valid.settings, width: 'not-a-number' },
    };
    await expect(renderTemplate(JSON.stringify(invalid))).rejects.toThrow(
      /invalid template content/i
    );
  });

  it('throws when a block is missing required fields', async () => {
    const valid = createMergeTagFixture();
    const invalid = {
      ...valid,
      blocks: [{ type: 'paragraph', content: 'hello' }],
    };
    await expect(renderTemplate(JSON.stringify(invalid))).rejects.toThrow(
      /invalid template content/i
    );
  });

  it('throws on empty string input', async () => {
    await expect(renderTemplate('')).rejects.toThrow();
  });

  it('throws on null input', async () => {
    await expect(renderTemplate('null')).rejects.toThrow(/invalid template content/i);
  });
});
