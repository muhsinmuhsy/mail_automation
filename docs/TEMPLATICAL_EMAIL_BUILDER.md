# Templatical Email Builder — Plan

> Status: **PLAN v7 (final) — APPROVED architecture, awaiting go signal to implement.** v7: (1) `// server-only` comments → `// used server-side in this application` (renderer can run browser or server); (2) `renderTemplate()` now checks `mjml2html` errors and throws on fatal compilation errors — does not blindly trust success; render-error test expanded to cover mjml errors; (3) added §15.1 manual staging checklist (Vercel preview → create → save → reload → preview → send test → verify Gmail) as a release gate. v6: reusable validator, B2 hardening, transactional save. v5: blast-radius. v4: all test levels + folder audit. v3: TemplateContent parse, source-of-truth, B2 public, renderer wording, preview security, merge-tag backing. No code written yet.
> Decision date: 2026-09-09. Supersedes the GrapesJS+MJML plan and the rejected Easy Email / Maily options.

## 1. Decision

Adopt **Templatical** (`@templatical/editor` + `@templatical/renderer`) as the visual email editor for the Mailchimp-style `/templates` page.

### Why Templatical over the alternatives

| Option | Verdict | Reason |
|---|---|---|
| Easy Email | **Rejected** | `easy-email-core` peer-dep `react ^18`; project is React 19 / Next 16. No React-19 build exists. |
| Maily (`@maily-to/core`) | **Rejected** | React-19 compatible, but bundles Tailwind v4 with **no style isolation**. The app is also Tailwind v4 → two TW-v4 instances collide in the same DOM. Mitigation = iframe, which negates the native-React advantage. |
| GrapesJS + MJML | **Superseded** | No style isolation (needs iframe workaround); general-purpose page builder, more glue; heaviest. Templatical gives the same MJML output with Shadow DOM isolation and email-specific features built in. |
| **Templatical** | **Chosen** | (a) Shadow DOM isolation — host Tailwind v4 cannot bleed into the editor; (b) MJML output matches the approved persistence/compile design; (c) `{{token}}` Handlebars merge tags match the existing `replaceTemplateVariables` syntax exactly; (d) no React peer dependency — editor runtime is bundled and framework-agnostic → installs clean on React 19; (e) easiest integration (~20-line `init()` + container ref). |

### Verified package facts (npm registry, 2026-09-09)

- `@templatical/editor@0.34.0` — license FSL-1.1-MIT. peerDependencies: only sibling `@templatical/*` packages. **No React peer dep.** Vue/TipTap bundled inside. Self-contained ESM. **Browser-only** — loaded via dynamic import in the client component.
- `@templatical/renderer@0.34.0` — license MIT. peerDependencies: none. deps: `@templatical/types`. **Used server-side in this application; no React peer dependency.** (The package itself can run in browser or server per official docs; we intentionally use it server-side to keep rendering authoritative and out of the client bundle.) In this application, `renderToMjml()` is used server-side for TemplateContent → MJML; the official `mjml` package performs MJML → HTML (see §6).
- `mjml` — license MIT, no peer deps. **Server-only.** Does **MJML → HTML**. The SDK does not bundle an MJML compiler; we provide this package. **Pin the exact version verified during implementation** — do not assume 5.4.0; verify the latest compatible version at install time.
- All three under active development (Templatical) / stable (mjml); **pin exact versions** and watch GitHub releases.

### Known caveats (non-blocking)

- **v0.34.0** — public API stabilizing (SemVer + changesets). Pin the version.
- **FSL-1.1-MIT license** — source-available, auto-converts to MIT. No license key, no activation call, no telemetry. Per the official repo: embeddable in SaaS/commercial products, self-hostable, modifiable; the restriction is **not to repackage Templatical itself as a directly competing email-editor product**. Our use case (email-automation SaaS using Templatical as one component) fits. **Action: keep a copy of the LICENSE in the repo and review it before launch.**
- **One runtime font request** to `https://fonts.bunny.net` (Geist UI font). Graceful fallback if blocked. **Preferred for production: self-host Geist** and strip the `@import` from `@templatical/editor/dist/style.css` as a build step (avoids a runtime dependency on a third-party font CDN). Fallback option: add `fonts.bunny.net` to CSP `style-src` + `font-src`.
- **Container constraints** — container must have a defined height; no `transform` / `filter` / `perspective` / `will-change` / `opacity<1` / `isolation` / `contain` / positioned-`z-index` on ancestors (standard for fixed-overlay libraries).

## 2. Current system (verified in code)

- React 19.2.8, Next 16.3.2 (App Router, `(dashboard)` route group), Tailwind v4, TypeScript, zod, Prisma 7.10, Vitest + jsdom.
- `prisma/schema.prisma` `Template` model (line 210): `id, user_id, name, subject, body (Text), created_at, updated_at`. **Plain text only.**
- `prisma/schema.prisma` `EmailJob` model (line 255): snapshots `body (Text)` per job. **No HTML field.**
- `lib/email/template.ts` — `replaceTemplateVariables(text, contact)` using `VARIABLE_PATTERN = /\{\{\s*(\w+)\s*\}\}/g`. Tokens: built-ins `name`, `email`, `first_name` + custom fields. Non-recursive, prototype-pollution safe.
- `lib/jobs/scheduler.ts:66` — `body: replaceTemplateVariables(template.body, templateContact)` snapshots resolved text into the EmailJob.
- `lib/email/mime.ts:92` `buildMimeMessage` — **`text/plain` only** (`bodyContentType = 'text/plain; charset="UTF-8"'`). Single part, or `multipart/mixed` with attachments. **No `multipart/alternative`.**
- `app/api/templates/route.ts` — `defineRoute` + `respondOk/respondList/respondError` + zod (`createTemplateSchema`) + `auth: 'user'` + `rateLimitKey`.
- `lib/validation/template.ts` — `createTemplateSchema { name, subject, body }`, `updateTemplateSchema`.
- `app/(dashboard)/templates/page.tsx` — list + `TemplateForm` (plain textarea + merge-tag picker) + `TemplateCard` + pagination.
- `prisma/migrations/` — naming convention `YYYYMMDD_snake_case`.
- Storage: Backblaze B2 via `@aws-sdk/client-s3`; `Attachment` model (`id, user_id, filename, storage_key, size_bytes, ...`).

## 3. Schema changes

### 3.1 `Template` model — add editor content columns

```prisma
model Template {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id    String   @db.Uuid
  user       User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  name       String   @db.VarChar(100)
  subject    String   @db.VarChar(200)
  // Editor content (Templatical JSON). Null for legacy plain-text templates.
  body_json  String?  @db.Text
  // Server-rendered MJML representation (from @templatical/renderer, see §6). Null for legacy.
  body_mjml  String?  @db.Text
  // Server-compiled HTML (from mjml package, see §6). Null for legacy.
  body_html  String?  @db.Text
  // Plain-text fallback (derived from HTML). Legacy `body` migrates here.
  body_text  String?  @db.Text
  // DEPRECATED: retained for backward compat during migration. Equals body_text for new templates.
  body       String   @db.Text
  created_at DateTime @default(now()) @db.Timestamptz
  updated_at DateTime @updatedAt @default(now()) @db.Timestamptz
  // ... relations, indexes unchanged
}
```

Column names are **snake_case** per project convention.

**Source-of-truth vs derived cache (matches official Templatical storage model):**
- `body_json` — **SOURCE OF TRUTH.** The editor content. Everything else is derived from this.
- `body_mjml` — **DERIVED CACHE.** Server-rendered from `body_json` via `@templatical/renderer`.
- `body_html` — **DERIVED CACHE.** Server-compiled from `body_mjml` via `mjml`.
- `body_text` — **DERIVED CACHE.** Derived from `body_html`.

Because the three compiled columns are caches, **if a future renderer or mjml version changes output, the system can regenerate `body_mjml`, `body_html`, and `body_text` from `body_json`** (a one-time re-render job over all templates). `body_json` is never regenerated from the caches.

### 3.2 `EmailJob` model — snapshot HTML + text

```prisma
model EmailJob {
  // ... existing fields ...
  body       String   @db.Text   // existing — keep as plain-text fallback
  body_html  String?  @db.Text   // NEW: resolved HTML (merge tags already substituted)
  // ... rest unchanged
}
```

The job snapshots **resolved** HTML + text at schedule time (same pattern as the existing `body` snapshot at `scheduler.ts:66`), so later template edits don't change in-flight jobs.

### 3.3 Migration

- Name: `20260909_templatical_template_columns`.
- For each existing template: set `body_text = body` (copy plain text into the new fallback column). `body_json`, `body_mjml`, `body_html` stay null (legacy plain-text template).
- Add columns as nullable first (backward compatible), then backfill, then no hard NOT-NULL constraint (legacy templates remain null until opened in the editor).

## 4. Dependencies

Add to `package.json` `dependencies` (pin exact):

```json
"@templatical/editor": "0.34.0",
"@templatical/renderer": "0.34.0",
"mjml": "<pin exact version verified at install time>"
```

- `@templatical/editor` — **browser-only**, loaded via `dynamic(..., { ssr: false })`. Never imported in server code.
- `@templatical/renderer` — can run in browser or server (per official docs). **For this application, intentionally used server-side** to keep rendering authoritative and out of the client bundle. The browser sends only `bodyJson`; the server does all rendering.
- `mjml` — **server-only**. The MJML → HTML compiler. The SDK does not bundle one.
- Do **not** add `@templatical/quality`, `@templatical/media-library`, or `pusher-js` initially (optional peers; only if we enable the Issues panel / cloud media).

## 5. Editor component (client-only)

- New `components/templates/VisualEmailEditor.tsx` — `'use client'`. Renders a `<div ref={containerRef} style={{ height: '100vh' }} />` and calls `init({ container, onChange, ... })` in a `useEffect`; calls `editor.unmount()` on cleanup. Matches the official React integration pattern from the Templatical docs.
- Mount via `dynamic(() => import('@/components/templates/VisualEmailEditor'), { ssr: false })` per project convention (preference #9). The editor must not SSR — `init()` needs a DOM container.
- `onChange(content)` stores the Templatical JSON in component state; the parent form submits it as `bodyJson` to the API.
- Configure merge tags: pass the built-in + custom-field tokens to the editor config so the editor's merge-tag picker shows `{{name}}`, `{{email}}`, `{{first_name}}`, and custom fields (loaded from `/api/contact-fields`, same fetch already done in `TemplateForm.tsx:108-133`).
- **Container placement** — the editor page must not sit inside an ancestor with `transform`/`overflow:hidden`/stacking context (see §1 caveats). Audit the dashboard layout before finalizing (per the "UI must match existing structure" rule).

## 6. Server-side render (JSON → MJML → HTML)

The render pipeline uses **two** packages, split by responsibility (verified against official docs):

```
bodyJson ──@templatical/renderer──▶ MJML ──mjml package──▶ HTML ──html-to-text──▶ text
```

- `@templatical/renderer` does **TemplateContent → MJML** via `renderToMjml(content)`. **Important:** `content` is a parsed `TemplateContent` object, **not** a JSON string. The server must `JSON.parse(bodyJson)` and validate the shape before calling `renderToMjml`.
- The `mjml` package does **MJML → HTML** (`mjml2html(mjml)`). The SDK does not bundle an MJML compiler — we provide `mjml` (pin exact version at install time, see §4).
- HTML → plain text via a tag-stripping utility (e.g. `html-to-text` or a small inline stripper — pick at implementation).

New `lib/email/render.ts`:

```ts
import { renderToMjml } from '@templatical/renderer';   // used server-side in this application
import mjml2html from 'mjml';                            // used server-side in this application
import type { TemplateContent } from '@templatical/types';

export async function renderTemplate(bodyJson: string): Promise<{ mjml: string; html: string; text: string }> {
  const content = JSON.parse(bodyJson) as TemplateContent;   // parse + validate shape (zod or type guard)
  const mjml = await renderToMjml(content);                  // TemplateContent → MJML
  const { html, errors } = mjml2html(mjml, { minify: false }); // MJML → HTML
  // Do not blindly trust mjml2html success — treat serious errors as render failures.
  // IMPORTANT: the exact shape of `errors` items (property names like .type / .severity /
  // .message) must be verified from the INSTALLED mjml package's TypeScript types at
  // implementation time. Do not blindly copy this filter — inspect the real types and
  // classify fatal compilation errors accordingly.
  const fatal = errors.filter(/* classify fatal per installed mjml types */);
  if (fatal.length > 0) {
    throw new Error(`MJML compilation failed: ${fatal.map((e) => e.message).join('; ')}`);
  }
  const text = htmlToPlainText(html);                        // HTML → text fallback
  return { mjml, html, text };
}
```

- **Validate `content`** before `renderToMjml` — this must be a **reusable validator** (not just a comment). Build a zod schema or `@templatical/types` type guard in `lib/validation/template-content.ts` and export it for reuse by the API route, the render function, and tests. The full pipeline:
  ```
  request → bodyJson string size validation (zod) → JSON.parse → TemplateContent structural validation (reusable) → renderToMjml(content) → mjml2html(mjml) → htmlToPlainText(html)
  ```
  Do not pass an unvalidated `JSON.parse` result to the renderer.
- **Server-authoritative compile**: the client sends only `bodyJson`. The API compiles `body_mjml`, `body_html`, `body_text` server-side in the POST/PATCH handler and stores all four. The client never sends compiled HTML/MJML (prevents tampering; DB is the source of truth). Matches the approved v4–v8 design principle.
- Re-render on every save (editor JSON is the source; compiled columns are derived).
- `mjml2html` is synchronous and CPU-bound — for large templates, run inside the existing route handler (Neon serverless functions have a timeout budget; if templates get very large, move to the Cloudflare Worker which already handles heavy jobs). Note for implementation.

## 7. API changes

### 7.1 `POST /api/templates` and `PATCH /api/templates/[id]`

- Accept `bodyJson` (Templatical JSON string) in the request body (camelCase API contract per project convention).
- Validate with zod: `bodyJson: z.string().max(500000)` (JSON can be large; pick a generous max). Keep `name`, `subject` as today. The plain `body` field is accepted only for legacy/ backward-compat (see §11).
- On save: call `renderTemplate(bodyJson)` → store `body_json`, `body_mjml`, `body_html`, `body_text`. Also set `body = body_text` (keep the legacy column in sync for backward compat.
- **Transactional save (production-critical):** if `renderTemplate()` throws (render failure, invalid content, mjml error), the POST/PATCH must return an error and the **DB must remain unchanged**. Do NOT save `body_json` with null `body_mjml`/`body_html`/`body_text` — that leaves the template in a broken state where the UI thinks the save succeeded but sending will fail. Use a Prisma transaction: render first, then write all columns atomically. If render fails, roll back — no partial write.
- `GET /api/templates` — return `id, name, subject, created_at, updated_at` (not the full JSON in the list; load JSON on edit).
- `GET /api/templates/[id]` — return full template including `bodyJson` for the editor to load.

### 7.2 `POST /api/templates/[id]/preview`

- New route. Body: `{ contactId?: string }` (optional — preview with a real contact's merge values, or with sample data).
- Server loads the template, substitutes merge tags into `body_html` and `body_text` using `replaceTemplateVariables`, returns `{ html, text, subject }` for the preview pane. No save.
- **Security:** if `contactId` is provided, verify the contact belongs to the authenticated user (reuse the existing ownership-check pattern from `app/api/templates/[id]/route.ts:39-46`). **Sanitize the preview HTML** (strip executable `<script>`, event-handler attributes, `javascript:` URLs) and render in a **sandboxed iframe with scripts disabled** (`sandbox` without `allow-scripts`). Do not use `allow-same-origin` casually — it grants more privileges than an opaque sandbox; only use it if the preview content requires same-origin access for a specific reason, and prefer a fully opaque sandbox otherwise. Treat preview output as untrusted (Templatical supports HTML blocks). The official editor itself sandboxes HTML-block preview in an iframe.

### 7.3 Validation (`lib/validation/template.ts` + `lib/validation/template-content.ts`)

- Add `bodyJson` to `createTemplateSchema` / `updateTemplateSchema` (transport-level: `z.string().max(500000)`). Keep `body` optional for legacy.
- New `lib/validation/template-content.ts` — **reusable `TemplateContent` structural validator** (zod schema or `@templatical/types` type guard). Used by: the API route (after `JSON.parse`), `lib/email/render.ts` (before `renderToMjml`), and tests. This is a real exported validator, not an inline comment — so the same validation runs at every entry point.

## 8. Merge-tag wiring

- Templatical uses Handlebars `{{token}}` — **same syntax** as the existing `VARIABLE_PATTERN = /\{\{\s*(\w+)\s*\}\}/g`.
- `replaceTemplateVariables` already operates on plain strings and is non-recursive + prototype-safe. It works on `body_html` (HTML string) and `body_text` unchanged — the `{{token}}` tokens survive the MJML→HTML compile because they're plain text in the content.
- **CRITICAL implementation test (named, must pass before merge):** `{{token}}` placeholders must survive the full render pipeline **literally**. Verify that `Hello {{first_name}}` in the editor produces `Hello {{first_name}}` in the output MJML **and** HTML. **Official docs confirm this:** the Templatical renderer preserves merge tags unchanged and passes them through as literal text — it does **not** evaluate merge tags. So the survival test is now backed by official documentation, not just a guess — but still write the test to guard against regressions across version bumps (merge-tag support is actively expanding; v0.34.0 added merge tags in rich-text link URLs). Write this test first, before any other editor wiring.
- Custom fields: the editor's merge-tag list is built from `/api/contact-fields` (same source as `TemplateForm` today).

## 9. MIME changes (`lib/email/mime.ts`)

- Extend `BuildMimeOptions`: add `bodyHtml?: string` and `bodyText: string` (text always required; HTML optional).
- When `bodyHtml` is present: build `multipart/alternative` with a `text/plain` part (existing `bodyText`) and a `text/html` part. Attachments wrap the `multipart/alternative` in `multipart/mixed` (nested structure: `multipart/mixed` → `multipart/alternative` → text + html, then attachments). This is the standard MIME structure for HTML email with attachments.
- When `bodyHtml` is absent: keep current behavior (single `text/plain`).
- Update the unit test `tests/unit/email/mime.test.ts` to cover the `multipart/alternative` path.

## 10. Sending pipeline changes

- `lib/jobs/scheduler.ts:66` — snapshot both: `body: replaceTemplateVariables(template.body_text, ...)` (text) and `body_html: replaceTemplateVariables(template.body_html, ...)` (HTML) into the EmailJob. Both are pre-substituted per contact at schedule time (same snapshot pattern as today).
- `lib/jobs/consumer.ts` — pass `bodyHtml` through to `sendEmail`.
- `lib/email/service.ts` — add `bodyHtml?: string` to `SendEmailParams`; pass `bodyHtml` + `bodyText` (the existing `body`) to `buildMimeMessage`. The provider's `SendEmailInput` is **unchanged** — providers send the pre-built `mimeMessage`, which now contains `multipart/alternative`. **No Gmail/SMTP provider changes needed.**
- For legacy templates (`body_html` null): send text-only (current behavior). No regression.

### 10.1 Campaign + merge-field + custom-field updates (blast radius)

These call sites currently read `template.body` and must read the visual-template columns instead. **The plan did not previously cover these — they are the real blast radius of the change:**

- **`lib/campaigns/missing-values.ts`** — `runMissingValueCheck(prisma, userId, templateSubject, templateBody, contactIds)` scans `templateBody` for `{{token}}` to detect contacts with missing values before sending. The function itself is body-agnostic (plain regex scan), but its **call sites** pass `template.body`. For visual templates the tokens live in `body_html`/`body_text`, not `body`. Fix the call sites:
  - `app/api/campaigns/route.ts:102` — pass `template.body_html ?? template.body_text ?? template.body` instead of `template.body`.
  - `app/api/campaigns/pre-check/route.ts:60` — same.
  - **Why critical:** if the pre-check scans the wrong column, it won't detect missing merge values for visual templates → emails sent with literal `{{token}}` markers.

- **`app/api/contact-fields/[id]/route.ts:229-245`** — the "which templates use this field?" check (run before deleting a custom field) scans `t.body` for `{{token}}`. For visual templates the tokens are in `body_html`/`body_text`/`body_json`. Must scan all non-null body columns:
  ```
  const tokens = new Set([
    ...scan(t.subject), ...scan(t.body),
    ...(t.body_html ? scan(t.body_html) : []),
    ...(t.body_text ? scan(t.body_text) : []),
  ]);
  ```
  - **Why critical:** if a custom field is deleted and this check only scans `body`, it misses visual templates → the user doesn't get the "X templates use this field" warning → templates keep unresolved `{{token}}` markers that get sent as literal text.

- **`lib/email/template-contact.ts`** — **no change.** Builds the token→value map; body-agnostic.
- **`lib/email/template.ts` `replaceTemplateVariables`** — **no change.** Works on any string (HTML or text); plain regex replace.
- **Providers (Gmail API, SMTP)** — **no change.** They send the pre-built `mimeMessage` from `buildMimeMessage`; the MIME change in §9 is sufficient.

## 11. Backward compatibility

- Existing plain-text templates: `body_text = body` (migration), `body_json`/`body_mjml`/`body_html` null. They continue to send as `text/plain` (no `body_html` → no multipart/alternative).
- The `body` column is kept and synced to `body_text` on every save. Old code paths that read `template.body` keep working.
- The plain-text `TemplateForm` (current) is **commented out, not deleted** (per the "comment out rather than delete" rule) once the visual editor ships, preserving a restoration path. Or: keep `TemplateForm` for a "plain text template" mode and add the visual editor as the default — decide at implementation.

## 12. Image upload

- Templatical's media library is an optional peer (`@templatical/media-library`). For v1, wire image upload to the existing **B2 public bucket** + `Attachment` model:
  - Editor image block → POST to a new `/api/templates/upload-image` route → B2 put → return a **stable HTTPS public URL suitable for long-lived email content**.
  - **Use B2 public bucket, not expiring signed URLs.** An email sent weeks/months later must still render its images — a short-lived presigned URL would expire and break the image. Stable public URLs are business-critical for email.
  - Reuse the existing `lib/storage/b2/` infrastructure and `Attachment` model (or a dedicated `template_asset` table if Attachment's semantics don't fit — decide at implementation).
  - Images are **not** deleted when a template is deleted (sent emails reference them).
  - **Upload endpoint hardening (production-critical):**
    - Require authentication (reuse existing `auth: 'user'` route guard).
    - Restrict to image content types only (e.g. `image/png`, `image/jpeg`, `image/gif`, `image/webp`) — **validate the actual content type server-side**, do not trust the client-supplied `Content-Type` header or file extension.
    - Enforce a max file size (e.g. 5 MB) — reject before streaming to B2.
    - Generate **safe server-side object keys** (e.g. `templates/{userId}/{uuid}.{ext}`) — do not use the client-supplied filename as the B2 key (prevents path traversal, collisions, and unsafe names).
    - Reject executable file types (`.svg` with scripts, `.html`, `.js`, etc.) even if the content type is spoofed.
    - Sanitize the filename stored in the `Attachment` model (strip path separators, control chars, excessive length).
- Defer `@templatical/media-library` (cloud media browser) to a later phase.

## 13. `/templates` page UI + folder structure

**Folder structure (respects existing conventions):**
- `lib/email/render.ts` — new, alongside existing `lib/email/template.ts`, `mime.ts`, `service.ts`. ✅
- `components/templates/VisualEmailEditor.tsx` — new, alongside existing `TemplateCard.tsx`, `TemplateForm.tsx`, `TemplateList.tsx`. ✅
- `app/api/templates/[id]/preview/route.ts` — new sub-action under `[id]/`, matches the existing pattern (`app/api/campaigns/[id]/cancel/`, `resume/`, `pause/`). ✅
- `app/api/templates/upload-image/route.ts` — new. Images aren't tied to a specific template (they survive deletion), so this sits at the templates level, not under `[id]/`. Alternative: `app/api/template-assets/route.ts` as a standalone resource — decide at implementation; both respect existing conventions.
- `prisma/migrations/20260909_templatical_template_columns/` — matches existing `YYYYMMDD_snake_case`. ✅
- Tests in `tests/unit/email/`, `tests/integration/api/`, `tests/unit/campaigns/`, `tests/worker/` — all match existing locations. ✅

**Page UI:**
- The existing dashboard convention is **list-only pages** (`templates/`, `contacts/`, `campaigns/`, `attachments/` — no `[id]/edit` routes). Editing today happens inline (collapsible `TemplateForm` panel). To respect this, the visual editor opens as a **full-screen overlay/modal** on `/templates` (via the existing `Dialog` component or a route-level intercept), NOT a separate `/templates/[id]/edit` page. A visual editor needs near-full-viewport space, so use a large/full-screen `Dialog` rather than the inline card. Audit the dashboard layout for the §1 container constraints (no `transform`/stacking-context ancestors) before finalizing.
- List view: keep the existing card grid + pagination. `TemplateCard` adds a thumbnail (render `body_html` in a scaled iframe or a server-generated PNG later — deferred per §17).
- "New template" / edit: open the `VisualEmailEditor` overlay with name + subject fields above. Save → POST `bodyJson`.
- Preview: a "Preview" button hits `/api/templates/[id]/preview` and shows the resolved HTML in a sandboxed iframe.
- Follow the existing UI component library (`Button`, `Input`, `Dialog`, `EmptyState`, `LoadingSpinner`) and Tailwind v4 conventions.

## 14. Tests (all levels — Vitest + jsdom, no Playwright)

**New unit tests:**
- `tests/unit/email/render.test.ts` — `renderTemplate()`: valid `bodyJson` → MJML (renderer) → HTML (mjml) → text. Assert all three outputs.
- `tests/unit/email/render-error.test.ts` — invalid `bodyJson` (malformed JSON, not a valid `TemplateContent` shape) → throws a validation error before reaching `renderToMjml`. **Also:** valid `TemplateContent` but `mjml2html` returns serious errors → `renderTemplate()` throws (does not blindly return the partial HTML). Covers §6 mjml-error checking. Error path coverage.
- **Merge-tag survival test (§8)** — `Hello {{first_name}}` survives `renderTemplate()` literally in both MJML and HTML. Write first, before any editor UI. Backed by official docs (renderer preserves merge tags).
- `tests/unit/email/template.test.ts` (UPDATE existing) — confirm `replaceTemplateVariables` works on HTML strings with `{{token}}` (existing test covers plain text; add HTML-string cases).

**Update existing unit tests (pipeline threading):**
- `tests/unit/email/mime.test.ts` (UPDATE) — add `multipart/alternative` (text + html) and nested `multipart/mixed` → `multipart/alternative` → text + html + attachments. Keep existing text-only test.
- `tests/unit/email/service.test.ts` (UPDATE) — `sendEmail` threads `bodyHtml` to the MIME builder; assert the built MIME contains the HTML part when `bodyHtml` is present, and omits it when absent.
- `tests/unit/campaigns/scheduler.test.ts` (UPDATE) — scheduler snapshots both `body` (text) and `body_html` (HTML) into the EmailJob, with merge tags substituted per contact.

**Update existing worker/integration tests:**
- `tests/worker/scheduler.test.ts` + `tests/integration/worker/scheduler.test.ts` (UPDATE) — assert EmailJob rows carry `body_html` alongside `body`.
- `tests/worker/consumer.test.ts` + `tests/integration/worker/consumer.test.ts` (UPDATE) — consumer passes `bodyHtml` through to `sendEmail`; the sent MIME contains the HTML part.

**New integration tests:**
- `tests/integration/api/templates.test.ts` (UPDATE existing) — POST/PATCH with `bodyJson` → stored `body_json`/`body_mjml`/`body_html`/`body_text`; GET `[id]` returns `bodyJson`; list GET excludes heavy columns.
- `tests/integration/api/templates-preview.test.ts` (NEW) — `/api/templates/[id]/preview` returns resolved HTML+text; ownership check rejects other users' contacts; sandboxed iframe rendering.
- `tests/integration/api/templates-upload-image.test.ts` (NEW) — upload route → B2 put → returns stable HTTPS public URL; rejects unauthenticated; rejects non-image content types; rejects oversized files; rejects client-supplied filename as object key (server generates safe keys); rejects executable types even with spoofed content type. Covers §12 hardening.
- `tests/integration/api/templates-backward-compat.test.ts` (NEW) — legacy template (`body_json`/`body_html` null, `body_text` set) sends as `text/plain` only (no `multipart/alternative`); existing campaigns using legacy templates are unaffected.
- `tests/integration/api/templates-render-failure-rollback.test.ts` (NEW) — **transactional save (§7.1):** if `renderTemplate()` throws (invalid TemplateContent, mjml error), POST/PATCH returns an error and the DB is **unchanged** — no `body_json` saved with null `body_mjml`/`body_html`/`body_text`. Verify the template row is identical before and after the failed request.
- `tests/integration/api/campaigns-missing-values-visual.test.ts` (NEW) — missing-value pre-check scans `body_html` for visual templates (not just `body`); detects contacts missing a custom field value referenced in the HTML body. Covers §10.1 gap.
- `tests/integration/api/contact-fields-deletion-visual.test.ts` (NEW) — deleting a custom field warns about visual templates that use it in `body_html`/`body_text` (not just `body`); no false "0 templates affected" when the field is in the HTML body. Covers §10.1 gap.

**Component test:**
- `tests/unit/components/templates/VisualEmailEditor.test.tsx` (NEW) — mounts and calls `init` (mock `@templatical/editor`); asserts the React integration contract (ref → init → onChange → unmount on cleanup). Does NOT exercise the real Shadow-DOM editor (jsdom limitation); accepted as the tradeoff for the "no Playwright" rule. The merge-tag survival test + integration tests cover the render/API paths jsdom can't.

**Test command:** `npm run test` (vitest) runs all of the above. The four verification gates in §15 must all pass.

## 15. Verification gates (run before marking done)

1. `npm run typecheck` (tsc --noEmit)
2. `npm run lint` (eslint)
3. `npm run test` (vitest — unit + integration + component)
4. `npm run build` (next build)

All four must pass. Per the verification-gate rule. No Playwright (project rule).

### 15.1 Manual staging checklist (release gate, not a dependency)

Since there is no Playwright/browser automation, run this manual checklist on the Vercel preview deployment before release:

1. Open `/templates` → create template → editor loads
2. Add a text block + an image block
3. Insert a merge tag `{{first_name}}`
4. Save → reload → editor content persists
5. Preview → HTML renders in sandboxed iframe
6. Send a test email to a real Gmail address
7. Verify in Gmail: HTML renders, image loads, `{{first_name}}` is replaced with the contact's name, plain-text fallback is present

## 16. Next 16 note

`AGENTS.md` warns this Next.js has breaking changes. Before writing the dynamic-import / route code, read the relevant guide in `node_modules/next/dist/docs/` (resolved from the repo root). Heed deprecation notices.

## 17. Out of scope (future phases)

- `@templatical/quality` (accessibility/structure lint panel).
- `@templatical/media-library` (cloud media browser).
- Saved blocks library (Templatical supports it; needs backend storage).
- Display conditions (Templatical supports; needs preview wiring).
- Template thumbnails (server-rendered PNG).
- Version history / comments (Templatical supports; needs backend).

## 18. Implementation order (after approval)

1. Install deps (`@templatical/editor`, `@templatical/renderer`, `mjml`), pin versions.
2. Prisma schema + migration `20260909_templatical_template_columns` + `prisma generate`.
3. `lib/validation/template-content.ts` (reusable TemplateContent validator) + `lib/email/render.ts` (renderer + mjml + html-to-text) + tests.
4. **Merge-tag survival test (§8)** — write + pass before any editor UI work.
5. API routes (POST/PATCH/GET/preview) + **transactional save** (render failure → rollback) + validation + tests.
6. `VisualEmailEditor` component + dynamic import (`ssr: false`).
7. `/templates` page rework (list + editor + preview).
8. MIME `multipart/alternative` + scheduler/consumer/service threading + tests.
9. **Campaign + merge-field updates (§10.1)** — fix `missing-values.ts` call sites (`campaigns/route.ts`, `campaigns/pre-check/route.ts`) to scan `body_html`; fix `contact-fields/[id]/route.ts` deletion check to scan all body columns; + tests.
10. Image upload route (B2 public bucket + §12 hardening).
11. Self-host Geist font (strip `@import` from editor CSS) — or CSP fallback.
12. Run all four verification gates (§15).
