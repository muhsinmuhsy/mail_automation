/**
 * Server-side HTML sanitizer for preview output.
 *
 * See docs/TEMPLATICAL_EMAIL_BUILDER.md §7.2. Strips executable content
 * (`<script>`, event-handler attributes, `javascript:` URLs) from preview HTML
 * before returning it to the client. The client also renders in a sandboxed
 * iframe (`sandbox=""`), so this is defense-in-depth — both layers must pass.
 *
 * This is intentionally a lightweight regex-based sanitizer, not a full
 * HTML parser. Templatical output is well-formed MJML-compiled HTML; we only
 * need to strip the dangerous patterns the plan calls out. For a full
 * sanitizer, install `sanitize-html` — but that adds a heavy dependency for
 * a defense-in-depth layer that the iframe sandbox already covers.
 */

const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const NOSCRIPT_TAG = /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi;
const EVENT_HANDLER_ATTRS_DOUBLE = /\son\w+\s*=\s*"[^"]*"/gi;
const EVENT_HANDLER_ATTRS_SINGLE = /\son\w+\s*=\s*'[^']*'/gi;
const EVENT_HANDLER_ATTRS_UNQUOTED = /\son\w+\s*=\s*[^\s>]+/gi;
const JAVASCRIPT_URL = /(?:href|src)\s*=\s*["']javascript:[^"']*["']/gi;
const DATA_URI_SCRIPT = /(?:href|src)\s*=\s*["']data:text\/html[^"']*["']/gi;
const IFRAME_TAG = /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi;
const OBJECT_TAG = /<object\b[^>]*>[\s\S]*?<\/object>/gi;
const EMBED_TAG = /<embed\b[^>]*>/gi;

/**
 * Strip dangerous content from an HTML string for safe preview rendering.
 *
 * Removes:
 * - `<script>` and `<noscript>` tags (entire element including content)
 * - `<iframe>`, `<object>`, `<embed>` tags
 * - All `on*` event-handler attributes (onclick, onload, onerror, etc.)
 * - `javascript:` URLs in href/src attributes
 * - `data:text/html` URLs in href/src attributes
 *
 * Does NOT strip:
 * - `<style>` tags (CSS is needed for email rendering)
 * - `<img>` tags (images are needed for email rendering)
 * - `<a>` tags (links are needed for email rendering)
 * - `style` attributes (inline CSS is needed for email rendering)
 */
export function sanitizePreviewHtml(html: string): string {
  return html
    .replace(SCRIPT_TAG, '')
    .replace(NOSCRIPT_TAG, '')
    .replace(IFRAME_TAG, '')
    .replace(OBJECT_TAG, '')
    .replace(EMBED_TAG, '')
    .replace(EVENT_HANDLER_ATTRS_DOUBLE, '')
    .replace(EVENT_HANDLER_ATTRS_SINGLE, '')
    .replace(EVENT_HANDLER_ATTRS_UNQUOTED, '')
    .replace(JAVASCRIPT_URL, '')
    .replace(DATA_URI_SCRIPT, '');
}
