import { describe, it, expect } from 'vitest';
import { renderTemplate } from '@/lib/email/render';
import {
  createMergeTagFixture,
  createRichFixture,
  serializeContent,
} from '@/tests/fixtures/template-content';

describe('lib/email/render (renderTemplate)', () => {
  it('renders a valid TemplateContent to MJML, HTML, and text', async () => {
    const bodyJson = serializeContent(createMergeTagFixture());
    const result = await renderTemplate(bodyJson);

    expect(result.mjml).toContain('<mjml');
    expect(result.mjml).toContain('Hello {{first_name}}');
    expect(result.html).toContain('<html');
    expect(result.html).toContain('Hello {{first_name}}');
    expect(result.text).toContain('Hello');
    expect(result.text).toContain('{{first_name}}');
  });

  it('renders a rich template with multiple block types', async () => {
    const bodyJson = serializeContent(createRichFixture());
    const result = await renderTemplate(bodyJson);

    expect(result.mjml).toContain('<mjml');
    expect(result.html).toContain('<html');
    expect(result.html).toContain('Welcome {{name}}');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('produces non-empty HTML for an empty-block template', async () => {
    const { createDefaultTemplateContent } = await import('@templatical/types');
    const bodyJson = serializeContent(createDefaultTemplateContent());
    const result = await renderTemplate(bodyJson);

    expect(result.mjml).toContain('<mjml');
    expect(result.html).toContain('<html');
  });
});
