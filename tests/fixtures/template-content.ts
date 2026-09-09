/**
 * Test fixtures for Templatical TemplateContent.
 *
 * Shared by render tests, merge-tag survival tests, and API integration tests.
 * Uses the official `@templatical/types` factory functions so the fixtures
 * match real editor output.
 */

import {
  createDefaultTemplateContent,
  createParagraphBlock,
  createSectionBlock,
  createTitleBlock,
  createButtonBlock,
} from '@templatical/types';
import type { TemplateContent } from '@templatical/types';

/**
 * A minimal valid TemplateContent with one paragraph block containing a
 * merge tag. Used by the merge-tag survival test (§8).
 */
export function createMergeTagFixture(): TemplateContent {
  const content = createDefaultTemplateContent();
  content.blocks.push(
    createParagraphBlock({ content: 'Hello {{first_name}}' })
  );
  return content;
}

/**
 * A richer fixture with a section, title, paragraph, and button — exercises
 * multiple block types through the full render pipeline.
 */
export function createRichFixture(): TemplateContent {
  const content = createDefaultTemplateContent();
  content.blocks.push(
    createTitleBlock({ content: 'Welcome {{name}}' }),
    createParagraphBlock({ content: 'Hi {{first_name}}, thanks for signing up!' }),
    createSectionBlock({
      children: [[
        createButtonBlock({ text: 'Get started', url: 'https://example.com' }),
      ]],
    })
  );
  return content;
}

/** Serialize a TemplateContent to the `bodyJson` string the API accepts. */
export function serializeContent(content: TemplateContent): string {
  return JSON.stringify(content);
}
