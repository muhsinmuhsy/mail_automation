/**
 * Server-side render pipeline: Templatical JSON → MJML → HTML → text.
 *
 * See docs/TEMPLATICAL_EMAIL_BUILDER.md §6. Used server-side in this application
 * to keep rendering authoritative and out of the client bundle. The browser
 * sends only `bodyJson`; the server does all rendering.
 *
 * Pipeline:
 *   bodyJson → JSON.parse → TemplateContent validation → renderToMjml → mjml2html → htmlToText
 *
 * `@templatical/renderer` does TemplateContent → MJML.
 * The `mjml` package does MJML → HTML (the SDK does not bundle a compiler).
 * `html-to-text` does HTML → plain-text fallback.
 */

import { renderToMjml } from '@templatical/renderer';
import type { TemplateContent } from '@templatical/types';
import mjml2html from 'mjml';
import { convert as htmlToText } from 'html-to-text';
import { parseTemplateContent } from '@/lib/validation/template-content';

export interface RenderedTemplate {
  mjml: string;
  html: string;
  text: string;
}

/**
 * Convert an HTML string to plain text for the `text/plain` MIME alternative.
 *
 * Uses `html-to-text` with conservative options suitable for email fallback:
 * wordwrap at 100 chars, preserve whitespace, no base64/selector processing.
 */
function htmlToPlainText(html: string): string {
  return htmlToText(html, {
    wordwrap: 100,
    preserveNewlines: true,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'a', options: { linkBrackets: false } },
    ],
  }).trim();
}

/**
 * Render a Templatical `bodyJson` string to MJML, HTML, and plain text.
 *
 * @param bodyJson — the Templatical editor JSON string (source of truth).
 * @returns `{ mjml, html, text }` — the three derived representations.
 * @throws if `bodyJson` is not valid JSON, fails `TemplateContent` structural
 *   validation, or `mjml2html` reports fatal compilation errors.
 *
 * The function does NOT blindly trust `mjml2html` success — it inspects the
 * `errors` array and throws when any error is present. MJML errors indicate
 * structural problems that would produce broken HTML, so we treat them as
 * render failures rather than shipping partial output.
 */
export async function renderTemplate(bodyJson: string): Promise<RenderedTemplate> {
  const content = parseTemplateContent(bodyJson) as unknown as TemplateContent;

  const mjml = await renderToMjml(content);

  const { html, errors } = await mjml2html(mjml, { minify: false });

  if (errors.length > 0) {
    const messages = errors.map((e) => e.message).join('; ');
    throw new Error(`MJML compilation failed: ${messages}`);
  }

  const text = htmlToPlainText(html);

  return { mjml, html, text };
}
