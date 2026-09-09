# GrapesJS MJML Email Template Builder — Implementation Plan (v8)

> **Status:** Ready for implementation. Production acceptance requires the verification gates below; this document does not certify an implemented or deployed feature.
> **Scope:** Documentation only. Gmail remains the only implemented sending provider; template rendering and MIME remain provider-independent.

> **Revision history:**
> - v6 to v7: Added explicit campaign, consumer, provider-contract, field-usage, history, and end-to-end delivery integration requirements and release evidence.
> - v5 → v6: Reconciled image retention and action labels; specified thumbnails, accessible editor interactions, safe compilation, API contracts, rollout, and measurable release gates.
> - v7 → v8: Fixed encoding artifacts (smart quotes, arrow char), success-criteria numbering, added missing file listings (thumbnail generation, shared content helper, HTML parser dependency), and send-test API contract.
> - v1 → v2: Store 4 columns; MJML exported by editor; removed jQuery claim; conditional juice; send-test in V1; starter templates; HTML escaping; `body_json` naming; UI design section.
> - v2 → v3: `body_mjml` wording corrected; CSS inlining simplified; merge-tag escaping redesigned; added rendering verification section; fixed typo; fixed "no external API calls".
> - v3 → v4: Dedicated editor workspace (not inline card); retain legacy `body` column; server-authoritative compilation; editor JSON kept out of sending/token checks; image delivery specified; MIME nesting; removed `css-inline.ts`; reconciled unknown-token handling; deferred code mode; added interaction states; templates page redesigned; starter templates include "Start blank" + "Plain text"; defined legacy template editing.
> - v4 → v5: Subject input given clear place in editor top bar; "Insert contact detail" replaces "Merge Tag" in user-facing controls; Preview/Send-test with unsaved changes explicitly defined (prompt to save first); migration mismatch fixed (make `body` nullable on Template + EmailJob); efficient loading (list API excludes `body_json`, fetch only when opening single template); removed B2 lifecycle cleanup suggestion.

---

## 1. Current System Structure & Status

### 1.1 Template Data Model

**Prisma `Template` model** (`prisma/schema.prisma:210-225`):

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | Primary key |
| `user_id` | UUID FK → User | Owner (cascade delete) |
| `name` | VarChar(100) | Display name |
| `subject` | VarChar(200) | Email subject line (may contain `{{token}}`) |
| `body` | Text (unbounded) | Email body — **plain text**, may contain `{{token}}` |
| `created_at` | Timestamptz | Creation timestamp |
| `updated_at` | Timestamptz | Last update timestamp |

**Relations:** `Campaign[]` (one template → many campaigns), `EmailJob[]` (snapshot reference per job).

**No unique constraint** on `(user_id, name)`. No soft-delete column. Deleting a template referenced by a campaign fails at the DB level (FK `NO ACTION`).

### 1.2 Template API Routes

| Route | Method | Auth | What it does |
|---|---|---|---|
| `/api/templates` | GET | user | Paginated list (`select: id, name, subject, created_at` — **body omitted**) |
| `/api/templates` | POST | user | Create (validates with `createTemplateSchema`, rate-limited) |
| `/api/templates/[id]` | PATCH | user+ownership | Update (validates with `updateTemplateSchema`) |
| `/api/templates/[id]` | DELETE | user+ownership | Hard delete |

**Validation** (`lib/validation/template.ts`):
- `name`: non-empty, max 100 chars
- `subject`: non-empty, max 200 chars
- `body`: any string (including empty), max 100,000 chars

### 1.3 Template UI

**Templates page** (`app/(dashboard)/templates/page.tsx`):
- Lists templates in a responsive grid (1/2/3 columns)
- "New template" button toggles a create-only form
- **No edit, no delete, no preview** in the current UI
- Pagination when > 1 page

**TemplateForm** (`components/templates/TemplateForm.tsx`):
- Three inputs: Template name (`<Input>`), Subject (`<Input>`), Body (`<Textarea>`)
- **MergeTagPicker** — "Insert merge tag" button opens a popover listing built-in + custom field tokens; clicking inserts `{{token}}` at cursor position
- Built-in tags: `Name → {{name}}`, `Email → {{email}}`, `First Name → {{first_name}}`
- Custom tags fetched from `/api/contact-fields` on mount
- No rich text, no formatting, no images, no layout blocks

### 1.4 Email Rendering Pipeline

```
Campaign POST
  → generateCampaignJobs (lib/jobs/scheduler.ts)
    → load template (subject + body)
    → for each contact:
        buildTemplateContact({ name, email }, contact_field_values, field_definitions)
        replaceTemplateVariables(template.subject, templateContact)
        replaceTemplateVariables(template.body, templateContact)
    → createMany EmailJob rows with pre-substituted subject/body (SNAPSHOT)
  → Cron scheduleDueJobs
    → Queue processQueueJob
      → sendEmail (lib/email/service.ts)
        → buildMimeMessage (lib/email/mime.ts)
        → provider.sendEmail(mimeMessage)
```

**Key characteristics:**
- **Snapshot at scheduling time** — subject/body are substituted once when the campaign is scheduled, stored on `EmailJob` rows. Editing contacts or templates after scheduling does not affect already-scheduled emails.
- **Plain text only** — MIME `Content-Type: text/plain; charset="UTF-8"`. No HTML, no `multipart/alternative`.
- **Merge-tag substitution** is non-recursive, prototype-pollution safe, idempotent. Unknown tokens left as literal `{{token}}`.

### 1.5 Merge Tag System

**Built-in tokens** (`lib/email/template.ts:27-31`):
```ts
SUPPORTED_TEMPLATE_VARIABLES = ['name', 'email', 'first_name'] as const;
```

**Custom field tokens** — any user-defined `ContactField.name` (alphanumeric + underscore, lowercase, unique per user).

**Substitution** (`replaceTemplateVariables`):
- Regex: `/\{\{\s*(\w+)\s*\}\}/g`
- `first_name` derived from `contact.name.split(/\s+/)[0]`
- `hasOwnProperty` check (prototype-pollution safe)
- Unknown tokens left as literal `{{token}}`

**Missing-value pre-check** (`lib/campaigns/missing-values.ts`):
- Scans template subject + body for `{{token}}` patterns
- Checks if contacts have null/empty values for those tokens
- Returns `{ missingValues, unknownTokens, affectedContactCount, totalContactCount }`
- Campaign wizard shows a 3-button dialog: Exclude / Continue / Cancel

### 1.6 MIME Generation

**`buildMimeMessage`** (`lib/email/mime.ts:92-159`):
- Headers: From, To, Subject (RFC 2047), Date, Message-ID, MIME-Version
- **Body: `Content-Type: text/plain; charset="UTF-8"`** — plain text, base64-encoded
- With attachments: `multipart/mixed` (text part first, then attachments)
- **No `text/html`**, no `multipart/alternative`, no CSS inlining
- Header injection prevention via `sanitizeHeaderValue`

### 1.7 Existing Dependencies

**No email-specific libraries** in `package.json`. No `mjml`, no `juice`, no `nodemailer`, no `react-email`. MIME builder is hand-rolled. SMTP via raw TLS sockets. Gmail via REST API.

### 1.8 Summary of Current Limitations

| Limitation | Impact |
|---|---|
| Plain text body only | No formatting, no images, no layout, no responsive design |
| No visual editor | Users must type raw text with `{{token}}` syntax |
| No HTML in MIME | Emails render as plain text in all clients |
| No template preview | Users can't see how the email will look |
| No edit/delete in UI | Templates are create-only in the UI |
| No send test email | Users can't verify rendering in a real email client |
| Editor squeezed into inline card | No room for a three-panel workspace |

---

## 2. What We Are Changing

### 2.1 Core Decision: GrapesJS + grapesjs-mjml

**GrapesJS** is a mature, open-source (BSD-3-Clause) visual builder framework. **grapesjs-mjml** is the official GrapesJS organization plugin (v1.0.8, March 2026) that provides MJML components and uses `mjml-browser` for in-editor rendering.

**Why this choice:**
- 100% free, open-source, self-hosted (no SaaS, no branding, no API limits)
- All-browser support (not Chrome-only like Easy Email free tier)
- MJML output → responsive HTML that works in Outlook, Gmail, Apple Mail, etc.
- Officially maintained by the GrapesJS organization
- Mature and battle-tested (8,000+ GitHub stars on GrapesJS)
- Modern plugin system based on standard JavaScript/TypeScript (not jQuery-dependent)

### 2.2 Architecture Changes

#### 2.2.1 Template Body Storage — Retain Legacy `body`, Add Nullable Editor Columns

**Current:** `body` column stores plain text.

**New:** Retain the existing `body` column for legacy plain-text templates. Add four nullable columns for visual templates:

| Column | Type | Nullable | What it stores | Used for |
|---|---|---|---|---|
| `body` | Text | Yes (existing) | Legacy plain-text body | Sending legacy templates as `text/plain` |
| `body_json` | Text | Yes | GrapesJS project JSON (`getProjectData()`) | Canonical editor source — reopen/edit |
| `body_mjml` | Text | Yes | MJML source (exported by editor) | Exported MJML representation — compile to HTML |
| `body_html` | Text | Yes | Compiled HTML (`mjml(body_mjml)`) | Send-ready HTML — fast sending |
| `body_text` | Text | Yes | Plain-text fallback (auto-generated) | `multipart/alternative` text part |

**Template type determination:**
- `body_json` is not null → **visual template** (send using `body_html` + `body_text`)
- `body_json` is null and `body` is not null → **legacy plain-text template** (send using `body` as `text/plain`)

**Why not rename `body` → `body_json`?**

Renaming plain text to `body_json` leaves that column containing two incompatible formats (plain text and GrapesJS JSON). Instead, we keep `body` as the legacy plain-text column and add nullable editor columns alongside it. This is a clean, additive migration — no data conversion needed.

**Migration:**
```sql
-- Make existing body columns nullable (currently NOT NULL in schema)
ALTER TABLE "templates" ALTER COLUMN "body" DROP NOT NULL;
ALTER TABLE "email_jobs" ALTER COLUMN "body" DROP NOT NULL;

-- Add nullable editor columns for visual templates
ALTER TABLE "templates" ADD COLUMN "body_json" Text;
ALTER TABLE "templates" ADD COLUMN "body_mjml" Text;
ALTER TABLE "templates" ADD COLUMN "body_html" Text;
ALTER TABLE "templates" ADD COLUMN "body_text" Text;

-- Add nullable HTML/text columns on EmailJob for visual template snapshots
ALTER TABLE "email_jobs" ADD COLUMN "body_html" Text;
ALTER TABLE "email_jobs" ADD COLUMN "body_text" Text;

-- No data migration needed — existing templates keep body, new columns are null.
-- Existing EmailJobs keep body, new columns are null.
```

**How users edit old plain-text templates:**
- When opening a template in the editor: if `body_json` is null and `body` is set → it's a legacy plain-text template
- Show a notice: "This is a plain-text template. Convert to visual editor?"
- If yes → initialize GrapesJS with a single text block containing the plain text, save as visual template (populates `body_json`, `body_mjml`, `body_html`, `body_text`; clears `body`)
- If no → allow editing as plain text using the existing textarea (updates `body` only)

**Backwards compatibility:** If `body_html` is null and `body` is set, the scheduler falls back to plain-text mode (existing behavior). Existing templates continue to work without any changes.

#### 2.2.2 Server-Authoritative Compilation

**The server generates `body_html` and `body_text` — the client never submits them.**

**On save (POST/PATCH `/api/templates`):**
1. Client sends: `body_json` + `body_mjml` (what the editor produces)
2. Server validates `body_json` and `body_mjml`
3. Server compiles: `body_html = mjml(body_mjml)`
4. Server generates: `body_text = htmlToText(body_html)`
5. Server saves all four representations together

**Why:** Don't trust client-submitted `body_html` as send-ready content. The server is authoritative for compiled output. This prevents a compromised or buggy client from storing malformed HTML that would be sent to recipients.

#### 2.2.3 Editor JSON Kept Out of Sending and Token Checks

**Personalization operates on `body_html` and `body_text`, not `body_json`.**

The scheduler substitutes merge tags in `body_html` and `body_text` (the email content), not `body_json` (editor metadata). The missing-value pre-check scans `body_html` (or `body_mjml`) for `{{token}}` patterns, not `body_json`.

**Why:** `body_json` is GrapesJS editor state — it contains component definitions, styling metadata, and internal IDs. Merge-tag substitution and token validation should operate on the actual email content, not the editor's internal representation.

#### 2.2.4 Dedicated Editor Workspace

**The editor is NOT squeezed into the current inline creation card.** A three-panel editor needs a dedicated, spacious workspace.

**New routes:**
- `/templates` — Templates list page (thumbnails, name, last edited, actions menu)
- `/templates/new` — Starter template picker → redirects to editor
- `/templates/[id]/edit` — Dedicated editor workspace

**Editor workspace layout** (uses existing app colors, typography, buttons, rounded panels):

```
┌──────────────────────────────────────────────────────────┐
│ Top bar                                                  │
│ ├── Back (to /templates)                                 │
│ ├── Template name (editable inline)                      │
│ ├── Subject (editable inline, with "Insert contact       │
│ │   detail" picker)                                      │
│ ├── Save status: Saving… / Saved / Couldn't save         │
│ ├── Undo  Redo                                           │
│ ├── Preview  (opens preview modal)                       │
│ ├── Send test  (prompts for email address)               │
│ └── Save                                                 │
├──────────┬───────────────────────────────┬──────────────┤
│ Left     │ Center                        │ Right        │
│ panel    │                               │ panel        │
│          │ Email canvas                  │              │
│ ├── Text │ (large, with obvious          │ Settings for │
│ ├── Image│  selection and insertion      │ selected     │
│ ├── Btn  │  indicators)                  │ block only   │
│ ├── Cols │                               │ (simple      │
│ ├── Div  │                               │  controls    │
│ ├── Space│                               │  first)      │
│ └── Insert│                              │              │
│   contact│                               │              │
│   detail │                               │              │
└──────────┴───────────────────────────────┴──────────────┘
```

**Subject input:** Placed prominently in the top bar alongside the template name. Has its own "Insert contact detail" picker for personalizing the subject line (e.g. `Hi {{first_name}}, your order is ready`).

**"Insert contact detail" (not "Merge Tag"):** All user-facing controls use the friendly label "Insert contact detail" instead of the technical term "Merge Tag". The picker shows friendly labels like "First name", "Email", "T-shirt size" — not raw tokens like `{{first_name}}`. The token syntax `{{token}}` is inserted behind the scenes.

**Left panel blocks:** Text, Image, Button, Columns, Divider, Spacer, Merge Tag. Clearly labeled with icons. Support both **click-to-add** and **drag-and-drop**, including keyboard-accessible controls.

**Right panel:** Shows settings for the currently selected block only. Simple controls first (text content, link, alignment). Advanced settings (padding, margin, border-radius) collapsed under "Advanced" to keep technical controls out of the normal workflow.

**Top bar save status:** Clear `Saving…` / `Saved` / `Couldn't save` states. Protection against losing unsaved work: `beforeunload` handler + navigation guard when there are unsaved changes.

#### 2.2.5 Templates List Page

**Current:** Simple grid of cards with name + subject, create-only form.

**New:**
- **Thumbnail previews** — render a small preview of the template HTML (for visual templates) or a plain-text icon (for legacy templates)
- **Template name** + **last edited date** (`updated_at`)
- **Edit button** — primary action, navigates to `/templates/[id]/edit`
- **Secondary actions menu** (dropdown or kebab menu): Preview, Send test, Duplicate, Delete
- **"New template" button** → navigates to `/templates/new` (starter template picker)

#### 2.2.6 Starter Template Picker

**`/templates/new`** shows:

```
Choose a starting point
├── Start blank         (empty GrapesJS canvas)
├── Plain text          (legacy textarea — for simple text-only emails)
├── Welcome             (welcome email with name + button)
├── Newsletter           (header + article + footer)
├── Product promotion    (image + description + CTA button)
├── Event invitation     (date/time + details + RSVP button)
└── Announcement         (simple text + link)
```

Starter templates are carefully designed with consistent spacing and typography. Stored as seed MJML in `lib/email/starter-templates/`. Selecting one initializes the GrapesJS editor with the pre-built MJML.

#### 2.2.7 Image Delivery

**Current attachment upload route** (`/api/attachments`) returns an attachment record with an ID — it does not establish a permanent public image URL.

**New:** Email images need **durable public URLs** accessible without logging into the app.

**Approach:**
1. GrapesJS `onUploadImage` callback POSTs the image to a new `/api/template-images` endpoint
2. The endpoint uploads to Backblaze B2 in a **dedicated public template-image bucket**, separate from private attachments
3. Returns the durable public URL (e.g. `https://f000.backblazeb2.com/file/your-bucket/template-images/{uuid}.png`)
4. The URL is embedded directly in the MJML/HTML

**Deletion rules:**
- Template images are **not deleted** when a template is deleted — they may be referenced by already-sent emails (EmailJob snapshots contain the HTML with image URLs)
- Published image URLs remain stable and accessible. Do not apply automatic expiration or archival rules that break delivery.
- Only abandoned, never-published uploads may be cleaned up after a documented grace period and reference checks. Sent-email references must not be inferred solely from the continued existence of database jobs.

**Image upload UX:**
- Upload progress indicator (percentage or spinner)
- Replacement: click an existing image to replace it
- Descriptive alt text field (accessibility)
- Actionable upload errors (file too large, wrong format, network error — with retry button)

#### 2.2.8 MIME Generation

**Current:** `Content-Type: text/plain; charset="UTF-8"` with base64 body.

**New for visual templates:** `multipart/alternative` with `text/plain` + `text/html`:

```
Content-Type: multipart/alternative; boundary="alt-boundary"

--alt-boundary
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: base64

<base64-encoded plain-text fallback>

--alt-boundary
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: base64

<base64-encoded HTML>

--alt-boundary--
```

**With attachments:** `multipart/alternative` nested inside `multipart/mixed`:

```
Content-Type: multipart/mixed; boundary="mixed-boundary"

--mixed-boundary
Content-Type: multipart/alternative; boundary="alt-boundary"

--alt-boundary
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: base64

<plain-text>

--alt-boundary
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: base64

<HTML>

--alt-boundary--

--mixed-boundary
Content-Disposition: attachment; filename="doc.pdf"
Content-Transfer-Encoding: base64

<attachment>

--mixed-boundary--
```

**Legacy templates:** If `body_html` is null and `body` is set → send as `text/plain` only (existing behavior). With attachments: existing `multipart/mixed` with text part first.

**CSS inlining — not in V1:**

V1 pipeline: `MJML → mjml2html() → HTML → send`. MJML handles CSS inlining via `mj-style inline="inline"`. If real Gmail/Outlook testing reveals a compatibility problem, introduce `juice` as a targeted fix at that point.

#### 2.2.9 Email Rendering Pipeline

**On SAVE (template editor → API):**
```
Client sends: body_json + body_mjml
Server:
  → validate body_json, body_mjml
  → body_html = mjml(body_mjml)        (server compiles)
  → body_text = htmlToText(body_html)  (server generates fallback)
  → save body_json, body_mjml, body_html, body_text together
```

**On SCHEDULE (campaign POST → scheduler):**
```
For visual templates (body_html is not null):
  template.body_html (HTML with {{token}})
    → replaceTemplateVariables(body_html, contact, context='html')
    → store on EmailJob.body_html

  template.body_text (plain text with {{token}})
    → replaceTemplateVariables(body_text, contact, context='text')
    → store on EmailJob.body_text

For legacy templates (body_html is null, body is set):
  template.body (plain text with {{token}})
    → replaceTemplateVariables(body, contact, context='text')
    → store on EmailJob.body (existing behavior)
```

**On SEND (consumer → MIME → provider):**
```
Visual template:
  → buildMimeMessage (multipart/alternative: text/plain + text/html)
  → [with attachments: multipart/mixed containing multipart/alternative + attachments]

Legacy template:
  → buildMimeMessage (text/plain — existing behavior)
  → [with attachments: multipart/mixed with text part — existing behavior]
```

#### 2.2.10 Merge-Tag HTML Escaping

**Context-aware escaping designed around known placeholder locations:**

| Token | Allowed contexts | Escaping |
|---|---|---|
| `{{name}}` | Text nodes | HTML-escape (`<` → `&lt;`, `>` → `&gt;`, `&` → `&amp;`) |
| `{{email}}` | Text nodes | HTML-escape |
| `{{first_name}}` | Text nodes | HTML-escape |
| Custom field tokens | Text nodes | HTML-escape |
| Personalized URL tokens | Deferred in V1 | Do not substitute tokens in attributes; validate static URLs separately |

**Design principle:** Don't let arbitrary merge tags become arbitrary HTML. Each supported token is validated/sanitized for its specific allowed context. A token in an unexpected context is left as a literal `{{token}}` rather than substituted.

**Implementation:** `replaceTemplateVariables(text, contact, context: 'text' | 'html')`:
- `context='html'` — HTML-escape values (text node context)
- `context='text'` — insert verbatim (plain-text fallback, existing behavior)

The HTML body is parsed to determine which context each `{{token}}` appears in. Use structured parsing (not regex) for allowed personalization locations. Sandboxed preview (iframe) to prevent XSS in the browser preview.

**Unknown-token handling — reconciled with existing "Continue anyway" behavior:**

The rendering verification test **reports** unknown tokens, it does not **reject** them. The existing campaign wizard "Continue anyway" behavior is preserved — users can choose to send even with unknown tokens (they'll appear as literal `{{token}}` in the email). The pre-check API returns `unknownTokens` for the wizard to display; the user decides whether to continue, exclude, or cancel.

#### 2.2.11 Template Edit, Delete, Preview, Duplicate & Send Test

- **Edit:** Navigate to `/templates/[id]/edit` → dedicated editor workspace loaded with `body_json`
- **Delete:** Secondary action → `ConfirmDialog` → `DELETE /api/templates/[id]`
- **Preview:** Opens a modal showing the rendered HTML in a sandboxed iframe with sample data (desktop/mobile toggle)
- **Send Test Email:** Prompts for email address → `POST /api/templates/[id]/send-test` → sends a real email with sample data substituted. Critical for verifying rendering in actual email clients.
- **Duplicate:** Secondary action → copies the template (all columns) as a new template

**Preview / Send Test with unsaved changes:**

When the user clicks Preview or Send Test and there are unsaved changes in the editor:

1. Preview with unsaved edits: offer **Save & preview** / **Cancel**.
2. Send test: collect sender and destination, then offer **Save & send test** when dirty or **Send test** when saved. Preview never sends email.
3. Save failure prevents the next action and preserves the draft. Disable duplicate submissions while saving/sending. Report provider acceptance as "Test email submitted", not guaranteed inbox delivery.

Users never unknowingly test an older saved version. The preview/test always reflects the current editor state (after an explicit save if needed).

#### 2.2.12 Template Validation

**Updated `createTemplateSchema`:**
```ts
{
  name: nonEmptyString.max(100),
  subject: nonEmptyString.max(200),
  // For visual templates:
  body_json: z.string().max(500000).optional(),         // GrapesJS project JSON
  body_mjml: z.string().max(500000).optional(),         // exported MJML
  // body_html and body_text are NOT accepted from client — server generates them
  // For legacy plain-text templates:
  body: z.string().max(100000).optional(),              // plain text (existing)
}
```

The server accepts `body_json` + `body_mjml` OR `body` (not both). If `body_json` is present, the server compiles `body_html` and `body_text`. If only `body` is present, it's a legacy plain-text template.

#### 2.2.13 Send-Test API Contract

**Endpoint:** `POST /api/templates/[id]/send-test`

**Request body:**
```json
{
  "toEmail": "test@example.com",
  "emailAccountId": "uuid-of-senders-gmail-account"
}
```

- `toEmail` — required, validated as a valid email address, max 255 chars.
- `emailAccountId` — required, must belong to the authenticated user (`user_id` check). Identifies which Gmail account sends the test. If the user has only one account, the client can pre-select it.

**Response — success (200):**
```json
{
  "message": "Test email submitted",
  "messageId": "rfc822-message-id"
}
```

The response confirms the provider **accepted** the message, not that it was delivered to the inbox. Do not automatically retry ambiguous provider delivery results (§9.3).

**Response — errors:**
- `400` — invalid `toEmail` or missing `emailAccountId`
- `403` — `emailAccountId` does not belong to the authenticated user
- `404` — template not found or not owned by the user
- `409` — template has no sendable content (neither `body_html` nor `body`)
- `429` — rate limit exceeded (dedicated `template-send-test` rate-limit key)
- `500` — provider submission failure (preserves draft; user can retry)

**Idempotency:** client sends an `Idempotency-Key` header (UUID). Double-clicks and request retries with the same key do not submit duplicate emails (§9.3).

**Rate limiting:** dedicated `template-send-test` key, stricter than campaign sending (e.g. 5 per minute per user). Prevents abuse of the test-send feature.

**Content:** the endpoint uses the **same rendering/MIME service** as campaign delivery (§11.3). Sample personalization values are substituted into the template's `body_html`/`body_text` (or `body` for legacy) before sending. This ensures test rendering is meaningful evidence for campaign delivery.

### 2.3 New Dependencies

| Package | Purpose | Cost | License |
|---|---|---|---|
| `grapesjs` | Visual builder framework | Free | BSD-3-Clause |
| `grapesjs-mjml` | MJML plugin for GrapesJS | Free | MIT |
| `mjml` | Server-side MJML → HTML compilation | Free | MIT |
| `html-to-text` | HTML → plain text fallback | Free | MIT |
| `cheerio` | Server-side HTML parsing for context-aware merge-tag escaping (§2.2.10 — structured parsing, not regex) | Free | MIT |
| `puppeteer` | Headless browser for thumbnail generation (§8 — isolated renderer, no app session) | Free | Apache-2.0 |
| `juice` | CSS inlining (deferred — add only if testing shows a need) | Free | MIT |

### 2.4 Files to Create

| File | Purpose |
|---|---|
| `app/(dashboard)/templates/new/page.tsx` | Starter template picker page |
| `app/(dashboard)/templates/[id]/edit/page.tsx` | Dedicated editor workspace page |
| `components/templates/VisualEmailEditor.tsx` | React wrapper around GrapesJS editor (client-only, dynamic import) |
| `components/templates/TemplateEditorToolbar.tsx` | Custom top bar (back, name, save status, undo/redo, preview, send test, save) |
| `components/templates/TemplateEditorPanels.tsx` | Left panel (blocks) + right panel (block settings) |
| `components/templates/TemplatePreview.tsx` | Preview modal (desktop/mobile toggle, sandboxed iframe) |
| `components/templates/MergeTagBlock.tsx` | GrapesJS custom block for merge tags |
| `components/templates/StarterTemplateGallery.tsx` | Starter template picker UI |
| `components/templates/TemplateThumbnail.tsx` | Thumbnail preview for templates list |
| `lib/email/mjml-compile.ts` | Server-side MJML → HTML compilation utility |
| `lib/email/html-to-text.ts` | HTML → plain text fallback generator |
| `lib/email/template-content.ts` | Shared helpers for resolving visual vs legacy content and extracting referenced tokens (used by campaign, pre-check, scheduler, field-deletion) |
| `lib/email/starter-templates/` | Seed MJML for 5 starter templates |
| `lib/email/thumbnail.ts` | Thumbnail generation utility — renders compiled HTML to a static image using an isolated renderer (no app session, restricted asset access) |
| `app/api/templates/[id]/send-test/route.ts` | Send test email endpoint |
| `app/api/templates/[id]/thumbnail/route.ts` | Thumbnail generation/status endpoint — returns thumbnail URL or triggers async generation |
| `app/api/template-images/route.ts` | Image upload endpoint (public B2 URLs) |

### 2.5 Files to Modify

| File | Changes |
|---|---|
| `prisma/schema.prisma` | Make `Template.body` and `EmailJob.body` nullable; add nullable editor columns to Template, HTML/text snapshots to EmailJob, and thumbnail metadata to Template |
| `prisma/migrations/.../migration.sql` | Make Template.body and EmailJob.body nullable; add editor/snapshot columns and thumbnail metadata; preserve existing rows |
| `lib/validation/template.ts` | Add `body_json`, `body_mjml` to schemas (server generates `body_html`, `body_text`) |
| `app/api/templates/route.ts` | Accept `body_json` + `body_mjml` on POST; server compiles `body_html` + `body_text`; GET list returns `id, name, subject, created_at, updated_at, thumbnail_url, thumbnail_status` only (NOT `body_json` — too large for list cards) |
| `app/api/templates/[id]/route.ts` | Accept `body_json` + `body_mjml` on PATCH; GET single template returns `body_json` (for editor reload); ownership-scoped detail fetch only when opening the editor |
| `components/templates/TemplateForm.tsx` | Legacy plain-text form (for "Plain text" starter option and editing legacy templates) |
| `components/templates/TemplateCard.tsx` | Thumbnail preview, last edited date, edit button, secondary actions menu |
| `app/(dashboard)/templates/page.tsx` | Redesign: thumbnails, last edited, edit/delete/preview/duplicate/send-test; navigate to `/templates/new` for creation |
| `lib/email/mime.ts` | Add `multipart/alternative` support; nest inside `multipart/mixed` when attachments present; accept `bodyHtml` + `bodyText` parameters |
| `lib/email/service.ts` | Pass `bodyHtml` and `bodyText` to `buildMimeMessage` |
| `lib/email/template.ts` | Add context-aware escaping to `replaceTemplateVariables` |
| `lib/jobs/scheduler.ts` | For visual templates: substitute `body_html` and `body_text`; for legacy: substitute `body` (existing behavior); store on EmailJob |
| `lib/campaigns/missing-values.ts` | Scan `body_html` (or `body_mjml`) for tokens, not `body_json`; report unknown tokens (don't reject — reconcile with "Continue anyway") |
| `app/api/campaigns/route.ts` | Validate and pre-check the selected template content consistently before generating jobs; preserve missing-value decisions and ownership checks |
| `app/api/campaigns/pre-check/route.ts` | Fetch visual HTML/text or legacy body plus subject; use shared token extraction |
| `app/api/campaigns/options/route.ts` | Return lightweight template format metadata for selection; never include full editor JSON or HTML |
| `components/campaigns/CampaignWizard.tsx` | Show Visual / Plain text, provide an on-demand sandboxed selected-template preview, preserve recipient and timing flow |
| `lib/jobs/consumer.ts` | Forward saved HTML/text or legacy body through initial delivery and OAuth-refresh retry; reject incomplete snapshots |
| `lib/email/providers/types.ts` | Align shared send input with supported content formats; keep prebuilt MIME authoritative for transports |
| `app/api/contact-fields/[id]/route.ts` | Count usage in subject and actual visual/legacy content using shared token rules, excluding editor metadata |
| `app/api/emails/[id]/route.ts` | Verify snapshot response contract and ownership with nullable legacy body and new HTML/text fields |
| `lib/email/providers/gmail/provider.ts` | Verify existing raw-MIME transport preserves HTML and attachments; change only if integration tests demonstrate a need |

### 2.6 Files to Update Tests

All test files that reference template `body`, MIME generation, or the scheduler will need updates:
- `tests/unit/email/template.test.ts`
- `tests/unit/email/template-contact.test.ts`
- `tests/unit/email/mime.test.ts`
- `tests/unit/validation/template.test.ts`
- `tests/integration/api/templates.test.ts`
- `tests/integration/api/campaigns.test.ts`
- `tests/integration/api/campaign-schedule.test.ts`
- `tests/worker/scheduler.test.ts`
- `tests/unit/campaigns/scheduler.test.ts`
- `tests/integration/worker/scheduler.test.ts`
- `tests/unit/components/templates/TemplateForm.test.tsx`
- `tests/unit/components/templates/TemplatesPage.test.tsx`
- `tests/unit/api/routes.coverage.test.ts`

**Additional delivery and campaign test targets:**
- `tests/worker/consumer.test.ts`
- `tests/worker/consumer-coverage.test.ts`
- `tests/worker/gmail-consumer.test.ts`
- `tests/integration/worker/consumer.test.ts`
- Existing campaign pre-check, options, wizard, pause/resume/cancel and field-usage tests (extend their current neighboring files).
- Shared email service and provider-contract tests, plus a production-build browser campaign journey.

**Regression tests for existing plain-text jobs:** Add tests that verify legacy plain-text templates (with `body` set, `body_html` null) still send as `text/plain` with the existing MIME structure, including with attachments.

---

## 3. Our Aim

### 3.1 Goal

Transform the template system from a **plain-text editor** into a **full Mailchimp-like visual email builder** using GrapesJS + grapesjs-mjml, while preserving:
- The existing merge-tag system (`{{token}}` substitution)
- The snapshot-at-scheduling-time semantics
- The missing-value pre-check (including "Continue anyway" behavior)
- Backwards compatibility with existing plain-text templates
- The existing API structure and auth/ownership model
- The existing UI patterns and component library

### 3.2 Success Criteria

1. **Dedicated editor workspace** — three-panel editor on its own page, not squeezed into an inline card
2. **Visual drag-and-drop editor** — users can create email templates by dragging or clicking blocks into a canvas; keyboard-accessible
3. **Responsive HTML output** — emails render correctly in Outlook, Gmail, Apple Mail, Yahoo, and mobile clients
4. **MJML compilation** — templates stored as GrapesJS JSON + MJML source; server compiles to responsive HTML on save
5. **Server-authoritative compilation** — client sends JSON + MJML; server generates HTML + plain-text; client never submits `body_html`
6. **Multipart/alternative** — visual template emails include both `text/html` and `text/plain` parts; nested inside `multipart/mixed` when attachments present
7. **Merge tags work in visual editor** — `{{token}}` syntax preserved; text-node escaping; personalized URL attributes deferred; unknown tokens reported (not rejected — "Continue anyway" preserved)
8. **Image upload to B2** — durable public URLs for email images; upload progress, replacement, alt text, actionable errors
9. **Template edit/delete/preview/duplicate** — full template management with thumbnails, last edited, secondary actions menu
10. **Desktop/mobile preview** — sandboxed iframe preview with desktop/mobile toggle
11. **Send test email** — send a real email to a specified address to verify rendering in actual email clients
12. **Starter template gallery** — 5 pre-designed templates + "Start blank" + "Plain text" options
13. **Save states** — clear Saving / Saved / Couldn't save states; protection against losing unsaved work
14. **Preview/Send-test with unsaved changes** — use **Save & preview** for preview and **Save & send test** for delivery; save failure prevents both subsequent actions. Users never unknowingly test an older saved version.
15. **Efficient list loading** — templates list API excludes `body_json` (large); fetch full project JSON only when opening a single template for editing
16. **Backwards compatible** — existing plain-text templates continue to work; regression tests for plain-text jobs
17. **No third-party email-editor SaaS dependency** — everything self-hosted (app already uses Gmail and B2 externally for sending/storage)
18. **All tests pass** — tsc, eslint, vitest, build all green

### 3.3 Non-Goals (Explicitly Excluded)

- **A/B testing** — not in scope
- **Template categories/folders** — not in scope
- **Conditional content** (`{{#if}}` logic) — not in scope
- **AMP for email** — not in scope
- **AI content generation** — not in scope
- **Team collaboration** — not in scope
- **Inbox previews** (render testing across 90+ email clients) — not in scope
- **Editable code mode** (MJML/HTML source editing) — deferred to post-V1; adds synchronization and validation work, contributes little to initial experience for nontechnical users
- **CSS inlining via `juice`** — deferred to post-V1; add only if real email-client testing demonstrates a need

### 3.4 Implementation Phases

| Phase | Scope | Key deliverables |
|---|---|---|
| **1. Dependencies & schema** | Add packages, add DB columns, migration | `grapesjs`, `grapesjs-mjml`, `mjml`, `html-to-text` installed; `body_json`, `body_mjml`, `body_html`, `body_text` nullable columns; migration (no data migration) |
| **2. GrapesJS editor component** | React wrapper, MJML plugin, merge-tag block, custom UI | `VisualEmailEditor.tsx`, `TemplateEditorToolbar.tsx`, `TemplateEditorPanels.tsx`, `MergeTagBlock.tsx`; client-only dynamic import; polished UI layout; image upload to B2 with progress/errors |
| **3. Dedicated editor pages** | Editor workspace, starter picker, templates list redesign | `/templates/new`, `/templates/[id]/edit` pages; `TemplateThumbnail.tsx`, `StarterTemplateGallery.tsx`; templates list with thumbnails + actions menu; save states + unsaved-work protection |
| **4. Server-side compilation** | MJML → HTML, HTML → text, send-test endpoint | `mjml-compile.ts`, `html-to-text.ts`; server generates `body_html` + `body_text` from `body_mjml`; send-test endpoint; template-images endpoint |
| **5. MIME & pipeline** | multipart/alternative, nested multipart/mixed, scheduler changes, HTML escaping | `mime.ts` supports HTML + nested MIME; `scheduler.ts` substitutes `body_html`/`body_text` for visual templates, `body` for legacy; `template.ts` adds context-aware escaping; `missing-values.ts` scans `body_html` not `body_json` |
| **6. Tests & verification** | Update all tests, rendering verification, regression tests | All test files updated; automated rendering checks (§4.1); regression tests for plain-text jobs; tsc, eslint, vitest, build green |

---

## 4. Technical Decisions

### 4.1 Storage: Retain Legacy `body` + Add Nullable Editor Columns

**Decision:** Keep existing `body` column. Add `body_json`, `body_mjml`, `body_html`, `body_text` as nullable columns.

Rationale: Renaming `body` → `body_json` leaves the column containing two incompatible formats. Instead, keep `body` for legacy plain-text templates and add nullable editor columns alongside. Clean, additive migration — no data conversion needed.

- `body_json` — canonical editor source. GrapesJS `getProjectData()` output. Required for lossless editor reopening.
- `body_mjml` — exported MJML representation used as the compilation source for generating `body_html`.
- `body_html` — compiled send-ready HTML from `mjml(body_mjml)`. Server-generated, not client-submitted.
- `body_text` — plain-text fallback. Auto-generated from HTML via `html-to-text`.

### 4.2 Server-Authoritative Compilation

**Decision:** Client sends `body_json` + `body_mjml`. Server compiles `body_html` + `body_text`.

Rationale: Don't trust client-submitted `body_html` as send-ready content. The server is authoritative for compiled output. This prevents a compromised or buggy client from storing malformed HTML.

### 4.3 Compile on Save, Not at Send Time

**Decision:** Compile MJML → HTML on save.

Rationale: The scheduler processes potentially thousands of contacts per campaign. Compiling MJML → HTML for each contact would be wasteful since the HTML is the same for all contacts (only merge-tag values differ). By compiling on save, the scheduler only does `replaceTemplateVariables` (string substitution), which is fast.

### 4.4 GrapesJS in React — Client-Only Dynamic Import

**Decision:** `'use client'` component + `next/dynamic` with `ssr: false`.

Rationale: GrapesJS is a vanilla JS library that requires `window` and `document`. In Next.js, it must be loaded client-side only:

```tsx
const VisualEmailEditor = dynamic(() => import('./VisualEmailEditor'), { ssr: false });
```

### 4.5 Image Delivery — Durable Public B2 URLs

**Decision:** New `/api/template-images` endpoint uploads to B2 public bucket, returns durable public URL.

Rationale: Email images need URLs accessible without authentication (email clients can't log into the app). The existing `/api/attachments` endpoint returns an attachment record, not a public URL. Images are not deleted when templates are deleted (may be referenced by sent emails).

### 4.6 Plain-Text Fallback — Auto-Generate from HTML

**Decision:** Auto-generate using `html-to-text` package on the server.

Rationale: Our accessibility and compatibility policy requires a plain-text alternative. Auto-generating from HTML ensures they stay in sync.

### 4.7 Merge Tags — Context-Aware Escaping

**Decision:** Use `{{token}}` syntax in `<mj-text>` content. Escape HTML text-node values; keep plain-text values literal. Personalized URL attributes are deferred in V1. Use structured parsing for allowed personalization locations.

Rationale: Don't let arbitrary merge tags become arbitrary HTML. Each token is validated for its allowed context. Unknown tokens are reported (not rejected) — the existing "Continue anyway" behavior is preserved.

### 4.8 CSS Inlining — Not in V1

**Decision:** V1 pipeline is `MJML → mjml2html() → HTML → send`. No `juice`.

Rationale: MJML handles CSS inlining. If real Gmail/Outlook testing reveals a problem, introduce `juice` as a targeted fix. Keep the pipeline simple.

### 4.9 MIME Nesting — multipart/alternative Inside multipart/mixed

**Decision:** For emails with attachments, nest `multipart/alternative` inside `multipart/mixed`.

Rationale: Correct MIME structure for HTML emails with attachments. The `multipart/mixed` contains the `multipart/alternative` (text + HTML) first, then attachment parts.

### 4.10 Code Mode — Deferred to Post-V1

**Decision:** Don't include editable MJML/HTML code mode in V1.

Rationale: Adds synchronization and validation work (keeping code view and visual view in sync). Contributes little to the initial experience for nontechnical users. Can be added post-V1 using GrapesJS's native code panel.

---

## 5. Risk Assessment

| Risk | Mitigation |
|---|---|
| GrapesJS bundle size (~500KB) | Load editor only on `/templates/[id]/edit` via dynamic import with `ssr: false` |
| MJML compilation is slow for large templates | Compile on save, not at send time; cache result in `body_html` |
| Existing plain-text templates break | Backwards-compatible: `body_html = null` + `body` set → plain-text mode; regression tests |
| Email clients strip CSS | MJML handles inlining; add `juice` only if real testing shows a problem |
| GrapesJS + React 19 compatibility | Test early in Phase 2; if issues, isolate in iframe |
| Test complexity increases | Mock GrapesJS in unit tests; integration test the compiled output |
| Merge-tag values contain HTML special chars | Context-aware escaping: HTML-escape text nodes; reject unsupported personalized attributes and validate static URLs |
| Server-side MJML reconstruction from JSON | Avoided entirely — store MJML exported by the editor |
| Image URLs become broken | Durable B2 public URLs; don't delete images referenced by sent emails |
| User loses unsaved work | Save states + `beforeunload` handler + navigation guard |

---

## 6. Email-Client Rendering Verification

### 6.1 Automated Tests (in CI)

CI must exercise the following behaviors. Runtime saves validate and compile; scheduling uses saved compiled content and never recompiles MJML:

| Check | What it validates |
|---|---|
| Valid MJML | `mjml(body_mjml)` compiles without errors |
| Successful compilation | `body_html` is non-empty and well-formed |
| No broken merge tags | All `{{token}}` in `body_html` match known tokens, where known tokens = built-in tokens + custom fields belonging to the template owner. Unknown tokens are **reported** (not rejected — "Continue anyway" preserved) |
| Valid HTML | `body_html` parses without structural errors |
| Multipart MIME structure | `buildMimeMessage` produces valid `multipart/alternative` with both `text/plain` and `text/html` parts; nested inside `multipart/mixed` when attachments present |
| Image URLs | All `<img src="...">` URLs are valid HTTPS URLs pointing to B2 |
| Links | All `<a href="...">` URLs are valid |
| Plain-text fallback | `body_text` is non-empty and contains no HTML tags |
| Legacy plain-text regression | Existing plain-text templates (with `body` set, `body_html` null) still send as `text/plain` with existing MIME structure |

### 6.2 Manual Rendering Tests (before each release)

Send test emails to real accounts and verify rendering in:

| Email client | What to check |
|---|---|
| Gmail (web) | Layout, images, fonts, colors, merge tags |
| Outlook (desktop) | Layout, images, fonts, colors (Outlook uses Word rendering engine) |
| Apple Mail (desktop) | Layout, images, fonts, colors |
| Yahoo Mail (web) | Layout, images, fonts, colors |
| Gmail (mobile) | Responsive layout, tap targets, images |

Browser preview is not sufficient — only real email clients validate actual rendering behavior.

---

## 7. Open Questions

1. **Subject line HTML entities?** — Currently subject is plain text. Some email clients support HTML entities in subject lines. **Recommendation:** Keep plain text for V1.

2. **Template versioning/history?** — Store previous versions when editing. **Recommendation:** Defer to post-V1.

3. **Custom block SDK?** — Let users define their own reusable blocks. **Recommendation:** Defer to post-V1.

4. **Image cleanup automation?** — Automatically delete unreferenced template images after a retention period. **Decision:** Defer cleanup automation. No lifecycle expiration for published images; only proven unpublished orphan uploads are eligible for later cleanup.


## 8. Premium UI acceptance contract

These requirements are part of V1 acceptance, not optional styling polish. Reuse the application's existing typography, color tokens, buttons, inputs, dialogs, focus styles, spacing, and rounded surfaces. Customize the GrapesJS shell so users experience one coherent application.

| Area | Required behavior |
|---|---|
| Workspace | Dedicated editor with collapsible app navigation. Template name and subject occupy a clear header row; actions occupy a separate toolbar when width is limited. No crowded single-row header. |
| Canvas | Neutral surrounding surface, centered email, clear selected-block outline and insertion marker. Clicking a block reveals its settings. Empty canvas explains how to add content. |
| Content controls | Text, Image, Button, Columns, Divider, Spacer. Click-to-add and keyboard equivalents accompany drag-and-drop. Provide move up/down, duplicate, and delete for the selected block. |
| Settings | Show relevant controls only. Use "Space around content" rather than CSS terminology. Keep advanced options collapsed; show useful defaults. |
| Personalization | "Insert contact detail" in subject and text editing. Friendly field labels, optional token explanation, insertion at the current caret, preservation through save/reopen. |
| Starter gallery | Real preview thumbnails, meaningful names, accessible selection, and a preview before choosing. Include Start blank and Plain text. |
| Save behavior | Explicit save in V1. Show Unsaved changes, Saving, Saved, or Couldn't save. Do not claim saved until the server confirms. Preserve edits on errors and prevent older responses replacing newer edits. |
| Navigation | Dirty-document guard for Back and internal navigation, plus browser unload protection where supported. Cancel keeps the current draft. |
| Small screens | Panels become drawers/tabs without covering the active controls. Preview width is distinct from workspace width. Verify at 390, 768, and 1440 CSS pixels. |
| Accessibility | Labeled controls, visible keyboard focus, Escape closes overlays, focus returns to the trigger, status announcements, sufficient contrast, and no drag-only operations. |
| Errors | Plain-language problem plus recovery action. Compilation errors preserve the draft. Failed image uploads retain the block and offer Retry. No raw stack traces. |

**New-template lifecycle:** The starter picker opens an unsaved editor state; first successful save creates the template and navigates to its edit URL. Do not create empty database records just by browsing starters. Subject and template name validation must show inline errors without discarding the design.

**Thumbnails:** Add nullable `thumbnail_url` and `thumbnail_revision`, plus `thumbnail_status` (pending/ready/failed). Generate a static thumbnail asynchronously from the server-compiled HTML of a saved revision. Keep thumbnails in authenticated storage or return short-lived authorized URLs. List responses include lightweight thumbnail metadata, never full project JSON. Lazy-load thumbnails; show a neutral fallback while pending or failed. A stale thumbnail task must not replace a newer revision's image. Thumbnail failure must not prevent saving or sending. Use an isolated renderer with no app session and restricted asset access.

## 9. Production implementation contracts

### 9.1 Valid template states and atomic saves

- Create requires either plain text `body`, or both `body_json` and `body_mjml`. Reject mixed or incomplete visual payloads. Parse project JSON and validate its expected shape; string length alone is insufficient.
- PATCH may update name/subject without changing content. Content replacement must supply a complete valid representation. Changing modes clears incompatible fields atomically.
- Preserve legacy rows and queued jobs. For visual jobs, snapshot subject, HTML, and text together; reject incomplete visual snapshots rather than silently sending an empty email.
- Use a revision/version check on save to detect competing tabs. Return a recoverable conflict and retain the user's draft instead of silently overwriting changes.
- Save editor JSON, exported MJML, compiled HTML, and generated text as one revision. Preview, send-test, and thumbnail generation identify that revision. Test that reopening project JSON reproduces the saved design.

### 9.2 Compilation and preview boundaries

Server compilation is not sanitization. Define an allowed MJML/component and attribute set for V1; reject scripts, event handlers, unsafe URL schemes, and unsupported raw HTML. Disable filesystem includes and arbitrary resource loading during compilation. Apply request, output-size, nesting, and execution limits. Verify that the selected compiler works in the application's deployment runtime before building the full UI; keep it outside the email worker.

Use a real parser for personalization contexts. V1 contact details are text-only; personalized URLs are deferred until field-specific URL rules exist. Static links and image sources are validated separately. Do not encode an entire URL as if it were a query parameter. Preserve MJML's email-specific markup, conditional comments, and responsive styles during transformations; verify with output fixtures.

Previews and editor-loaded content must not run user-authored scripts. Sandbox previews without app credentials or top-navigation privileges. Apply the same policy to thumbnails. Conversion from plain text must escape markup and preserve line breaks.

### 9.3 Images and test delivery

- Authenticate uploads; enforce ownership, file-byte validation, permitted raster formats, file-size and image-dimension limits. Generate opaque immutable object names and correct content types. Never make existing private attachments public.
- Public email images are intentionally accessible to recipients without login. Explain this at upload. Keep object URLs stable when a template or image block is deleted or replaced.
- Send-test uses the existing Gmail delivery service and account ownership checks. Allow an explicit active sender selection if multiple accounts exist; explain how to connect Gmail if none exists.
- Rate-limit test sends and use an idempotency key so double-clicks and request retries do not submit duplicate emails. Do not automatically retry ambiguous provider delivery results. Show sample personalization values before confirmation.
- Deleting an in-use template returns a friendly conflict naming its usage; never cascade-delete campaign history to make the action succeed.

### 9.4 Rollout and operations

Apply additive schema changes first. Release HTML-capable readers and workers before enabling visual-template creation or HTML jobs. Keep old queued plain-text jobs valid throughout rollout. A rollback must not leave an old worker consuming unsupported HTML-only jobs; gate creation separately from delivery capability.

Record safe diagnostics for compile failures, save conflicts, image uploads, thumbnail failures, and provider submission outcomes. Do not log OAuth secrets or complete personalized email content. Document the public image bucket configuration, compiler runtime requirements, and thumbnail worker setup in deployment instructions. No new provider implementation is part of this work.

## 10. Verification and release gates

Tests accompany each phase. Existing passing tests are baseline evidence only; they do not prove the new editor works.

| Layer | Required coverage |
|---|---|
| Validation and compilation | Plain/visual create and PATCH states; malformed JSON/MJML; bounded input/output; unsafe markup, includes and URLs; compile failure leaves previous revision intact. |
| Personalization | Subject, HTML text, and fallback text; ampersands, quotes, angle brackets, Unicode, zero/false, unknown tokens, nested tokens; no substitutions in editor metadata. |
| MIME and worker | Parse generated MIME with an independent parser. Assert text+HTML ordering, attachments, Unicode filenames, legacy jobs, and immutable scheduling snapshots. |
| API and database | Ownership for detail/edit/duplicate/delete/images/send-test; atomic save failure; concurrent revision conflicts; test-send idempotency; friendly in-use deletion errors. |
| Editor components | Selection, click-to-add, keyboard operations, caret insertion, undo/redo, upload failure/retry, save failure, dirty navigation, responsive panels, and focus restoration. |
| Real browser | Use the real GrapesJS editor: choose starter -> edit subject/text/image -> personalize -> save -> reload -> verify retained design -> preview -> submit test through a test transport. Mocked editor unit tests alone do not satisfy this gate. |
| Rendering | Verify representative starter emails in Gmail web/mobile and the named receiving clients. Identify the actual Outlook version tested; do not imply every Outlook variant renders identically. Record findings and remaining limitations. |
| Deployment | Production build starts successfully; compile/save/reopen works in the target runtime; new worker handles old and new jobs. |

Run the complete relevant test suites, typecheck, lint, and production build. Run browser tests against the production build, with isolated test data and a non-delivering test transport. Real delivery checks require explicitly designated test recipients. Keep CI evidence distinct from manual email-client results.

**Premium UI sign-off:** Verify the workspace at the specified widths, keyboard-only completion of the primary workflow, no data loss during failure/retry, and no misleading save or delivery status. Capture representative screenshots for review. The feature is production-ready only after these gates pass and material limitations are documented.


## 11. Campaign-to-delivery integration acceptance

The editor is not complete until a real campaign can schedule and deliver its saved visual content through the existing queue and Gmail service. This section is mandatory scope for Phases 5 and 6.

### 11.1 One consistent content contract

Define shared helpers under `lib/email/` for resolving plain-text versus visual content and extracting referenced tokens. Use them from campaign creation, pre-check, scheduling, and field-deletion usage detection. Scan subject and the actual sendable HTML/text content; deduplicate tokens and affected recipients. Do not scan project JSON, substitute metadata, or independently implement conflicting fallback rules.

For visual templates require complete server-generated HTML and text. For legacy templates preserve the existing body. Missing visual data is a recoverable validation error, not permission to send an empty message. Preserve literal unknown-token behavior when explicitly permitted by the campaign's existing missing-value action.

Scheduling must validate and snapshot the same selected template revision and recipient data used for the final pre-check. Avoid checking one revision and generating jobs from a later revision. Save personalized subject, HTML, and text together. Later edits to contacts, fields, or templates must not change existing jobs or retries.

### 11.2 Campaign experience

Keep campaign recipient selection, optional multiple attachments, scheduling, and single-recipient simplification. Add lightweight Visual / Plain text labels beside template choices and an on-demand preview. Clearly label sample personalization; if a selected contact is used, enforce ownership and show which contact is being previewed. Preview never sends.

Continue to show missing-contact-detail warnings before scheduling. Preserve Exclude / Continue / Cancel and prevent an empty recipient set. A failed preview or missing template should show a recoverable error without clearing the user's selected contacts or attachments.

### 11.3 Queue, delivery, and history

- The queue consumer reads saved job content and passes both alternatives to the sending service. The explicit OAuth-refresh retry must reuse identical content and attachments.
- The service builds MIME once per submission. Gmail sends the complete MIME; do not add a Gmail-specific HTML renderer. Future providers can reuse the same content/MIME contracts without implementing those providers now.
- Validate the final encoded message size using the active provider's message policy, accounting for HTML, plain text, MIME overhead, and attachment encoding. Retain existing attachment-count and file-size validation.
- Preserve existing reservation/accounting, timing, retries, pause/resume/cancel, and ambiguous-delivery protections. Rendering changes must not create duplicate sends or bypass usage limits.
- Email history retains status and timestamps. Any HTML detail preview must be sandboxed and display the stored snapshot, not a freshly rendered current template. Keep list endpoints lightweight.
- Test-send and campaign delivery must use the same rendering/MIME service, so successful test rendering is meaningful evidence for campaign delivery.

### 11.4 Required integration evidence

| Scenario | Required assertion |
|---|---|
| Visual campaign, no attachments | Saved job contains personalized HTML and text; captured provider MIME decodes to both alternatives |
| Visual campaign, multiple attachments | MIME nests alternatives inside mixed; all attachment bytes and filenames survive |
| Legacy campaign and pre-existing queued job | Existing plain-text content, encoding, and attachment behavior remain correct |
| Edit after scheduling | Delivered content remains the original snapshot even after contact/template changes |
| Missing fields and deleted custom tokens | Pre-check, final scheduling decision, and field-usage counts agree for subject, HTML and fallback text |
| Explicit OAuth rejection | Refresh retry forwards the same HTML/text and attachments, preserving existing rejection handling |
| Ambiguous provider outcome | Existing delivery-unknown protection prevents automatic duplicate submission |
| Scheduling controls | One-recipient flow, intervals, daily limits, pause/resume/cancel and accounting retain existing behavior |
| Size limit | Encoded MIME boundary cases are accepted/rejected consistently with provider policy |
| History and authorization | User cannot access another user's template/job/preview; history uses immutable snapshots |
| Full browser campaign | Real editor save -> campaign template selection -> preview -> recipients -> schedule -> worker -> captured test transport; independently parse and verify resulting MIME |

Run these with isolated test data. Mocked provider responses are appropriate for deterministic failure paths; real database tests verify persistence and concurrency, and an independent MIME parser verifies the submitted message. Tests must exercise the actual consumer and shared sending service, not merely call a rendering helper.

### 11.5 Completion checklist

- [ ] All affected files in section 2.5 are implemented or explicitly verified as requiring no change.
- [ ] Schema/client regeneration and deployment ordering preserve existing queued jobs.
- [ ] Unit, component, API/database, worker and browser campaign tests pass.
- [ ] Typecheck, lint and production build pass; production runtime smoke passes.
- [ ] Design and accessibility acceptance from section 8 is recorded.
- [ ] Authorized real Gmail test submission and receiving-client rendering checks are recorded separately from automated tests.
- [ ] Deployment configuration and rollback procedure are documented and checked.

Do not mark the feature production-ready based only on editor screenshots, compilation success, or test-email submission. Completion requires the full campaign delivery path and the evidence above. This checklist describes pending implementation work; updating this document alone does not complete it.
