/**
 * Merge-tag survival test (§8).
 *
 * CRITICAL: `{{token}}` placeholders must survive the full render pipeline
 * literally. `Hello {{first_name}}` in the editor must produce
 * `Hello {{first_name}}` in the output MJML AND HTML. Official docs confirm the
 * Templatical renderer preserves merge tags unchanged — it does NOT evaluate
 * them. This test guards against regressions across version bumps.
 *
 * This test is written FIRST, before any editor UI work, per the doc.
 */

import { describe, it, expect } from 'vitest';
import { renderTemplate } from '@/lib/email/render';
import {
  createMergeTagFixture,
  createRichFixture,
  serializeContent,
} from '@/tests/fixtures/template-content';

describe('merge-tag survival (§8)', () => {
  it('preserves {{first_name}} literally in MJML and HTML', async () => {
    const bodyJson = serializeContent(createMergeTagFixture());
    const { mjml, html } = await renderTemplate(bodyJson);

    expect(mjml).toContain('{{first_name}}');
    expect(html).toContain('{{first_name}}');
  });

  it('preserves multiple merge tags in a rich template', async () => {
    const bodyJson = serializeContent(createRichFixture());
    const { mjml, html } = await renderTemplate(bodyJson);

    expect(mjml).toContain('{{name}}');
    expect(mjml).toContain('{{first_name}}');
    expect(html).toContain('{{name}}');
    expect(html).toContain('{{first_name}}');
  });

  it('does not evaluate or strip merge tags in the text fallback', async () => {
    const bodyJson = serializeContent(createMergeTagFixture());
    const { text } = await renderTemplate(bodyJson);

    expect(text).toContain('{{first_name}}');
  });
});
