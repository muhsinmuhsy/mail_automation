import { z } from 'zod';

/**
 * Reusable structural validator for Templatical `TemplateContent` JSON.
 *
 * See docs/TEMPLATICAL_EMAIL_BUILDER.md §7.3. Used at every entry point that
 * accepts editor JSON: the API route (after `JSON.parse`), `lib/email/render.ts`
 * (before `renderToMjml`), and tests. This is a real exported validator — the
 * same validation runs at every entry point so untrusted JSON never reaches the
 * renderer unvalidated.
 *
 * The schema is intentionally permissive about block internals: Templatical
 * blocks have a large, version-evolving union of shapes (SectionBlock,
 * TitleBlock, ParagraphBlock, …). We validate the structural envelope
 * (`blocks` is an array of objects with `id` + `type` + `styles`;
 * `settings` has the required fields) rather than enumerating every block
 * variant. The renderer itself is the authority on per-block validity — if a
 * block type is unknown it emits a placeholder marker rather than throwing.
 */

const spacingValueSchema = z.object({
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
});

const blockStylesSchema = z.object({
  padding: spacingValueSchema,
  backgroundColor: z.string().optional(),
});

const blockVisibilitySchema = z.object({
  desktop: z.boolean(),
  mobile: z.boolean(),
});

const displayConditionSchema = z.object({
  label: z.string(),
  before: z.string(),
  after: z.string(),
  group: z.string().optional(),
  description: z.string().optional(),
});

/**
 * Per-block envelope. We require `id`, `type`, and `styles` — the fields every
 * `BaseBlock` has. Additional block-specific fields (content, src, columns, …)
 * are allowed through via `passthrough` so the renderer receives the full shape.
 */
const blockSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    styles: blockStylesSchema,
    visibility: blockVisibilitySchema.optional(),
    displayCondition: displayConditionSchema.optional(),
  })
  .passthrough();

const templateSettingsSchema = z
  .object({
    width: z.number().positive(),
    backgroundColor: z.string(),
    textColor: z.string(),
    linkColor: z.string().optional(),
    linkUnderline: z.boolean(),
    fontFamily: z.string(),
    preheaderText: z.string().optional(),
    locale: z.string(),
  })
  .passthrough();

export const templateContentSchema = z.object({
  blocks: z.array(blockSchema),
  settings: templateSettingsSchema,
});

export type ValidatedTemplateContent = z.infer<typeof templateContentSchema>;

/**
 * Parse and validate a `TemplateContent` JSON string.
 *
 * Returns the parsed content on success, throws `Error` on failure (malformed
 * JSON or structural validation failure). The thrown error carries a
 * human-readable message suitable for logging and API error responses.
 *
 * Used by `renderTemplate()` and the API routes so both paths share one
 * validation gate.
 */
export function parseTemplateContent(bodyJson: string): ValidatedTemplateContent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyJson);
  } catch {
    throw new Error('Template content is not valid JSON.');
  }

  const result = templateContentSchema.safeParse(parsed);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path.join('.') ?? '(root)';
    throw new Error(`Invalid template content at "${path}": ${firstIssue?.message ?? 'validation failed'}`);
  }

  return result.data;
}
