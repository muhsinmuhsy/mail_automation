# Template Starters (New-Template Picker) — Plan

> Status: **PLAN v6 — awaiting review. No code written yet.** v6 fixes 4 final issues: (1) §7.5 moved before §8; (2) §7.3 `TemplateStarters`→`StarterGallery`; (3) "build-time"→"pre-generated during development using a manually run script and committed"; (4) `aria-pressed`/`isSelected` removed — picking a starter immediately replaces the gallery with the editor, so the card never stays visible; plain `<button>` is sufficient. Also wrapped plaintext body sketches in code spans (the only backslashes in the file were `\n` in those sketches). v5 adds §7.5 reuse mapping (audited `components/ui/` inventory + folder conventions): explicit reuse of `Badge`/`EmptyState`/`LoadingSpinner`/`Button`/`PageHeader`; `StarterCard` uses a plain native `<button>`; no new `Card`/`TabList` primitives (per `prefer-existing-convention-over-new-abstraction.md` — codebase doesn't have them); files under `components/templates/`, tests under `tests/unit/components/templates/`. v4 fixes 6 remaining inconsistencies: (1) thumbnail strategy states one decision (pre-generated V1, lazy only as fallback); (2) `thumbnailHtml` made optional so blank starters type-check; (3) keyboard = native `<button>` + Tab navigation for V1 (no roving tabindex); (4) thumbnail generation = manually run script, output committed, not wired into build; (5) seeds/thumbnails/combined separated to avoid circular imports; (6) subject is required on every starter (blank uses empty string). Markdown verified clean — no escaped formatting. v3 adds §2.1 system status snapshot. v2 fixes 5 inconsistencies from review: (1) subject pre-fill is the committed behavior (§5.4 + §6.3 aligned); (2) `{{company}}` removed — only `{{name}}`/`{{email}}` allowed; (3) blank starters excluded from non-empty test checks; (4) format switching does not auto-convert — a starter seeds only its own format's state; (5) thumbnail generation is build-time only (lazy render is a fallback, not a parallel approach). Audited against the live system on 2026-09-16 (see §2). Aligns with `TEMPLATICAL_EMAIL_BUILDER.md` v7 (Templatical is the chosen visual editor) and the dashboard's list-only-page + full-screen-overlay convention.
> Decision date: 2026-09-16.

## 1. Goal

When a user clicks **"New template"** on `/templates`, show a **starter gallery** before opening the empty editor. The gallery offers prebuilt starting points for both **Visual (Templatical)** and **Plain text** templates, so the user is never staring at a blank canvas. This is the universal pattern used by Mailchimp, SendGrid, Brevo, Loops, and Postmark.

**Non-goals:** saved-block library, template thumbnails on the *list* page, version history, AI-generated templates, multi-step wizard. (See §9.)

## 2. Current system (audited 2026-09-16)

### 2.1 System status snapshot (verified 2026-09-16)

| Dimension | Status | Source |
|---|---|---|
| **Stack** | Next 16.3.2 (App Router), React 19.2.8, Tailwind v4, TypeScript 5, Prisma 7.10.0, Vitest 3.1.0, zod 3.24, mjml 5.4.0 | `package.json` |
| **Templatical** | `@templatical/editor@0.34.0`, `@templatical/renderer@0.34.0`, `@templatical/types@0.34.0` — installed in `node_modules` and integrated (`VisualEmailEditor.tsx`). Plan doc `TEMPLATICAL_EMAIL_BUILDER.md` v7 FINAL, architecture APPROVED, GO SIGNAL GIVEN 2026-09-09, implementation in progress. | `package.json:29-31`, `components/templates/VisualEmailEditor.tsx` |
| **Build / tests** | Last known green: all four gates (`tsc`, `eslint`, `vitest`, `next build`) clean; 1929 tests passed as of 2026-09-13. **Re-verify at implementation time** (per `verification-gate-after-implementation.md`). | memory `campaignwizard-flaky-test.md`, `build-sandbox-failure.md` |
| **Auth** | Google-only (Neon Auth). Email/password signin, register, forgot-password, verify-email, and app-password all commented out system-wide (preserved, not deleted). `/api/auth/[...path]` catch-all stays. | memory `auth-google-only-systemwide.md`, `neon-auth-catchall-must-stay.md` |
| **Custom fields** | Hybrid model IMPLEMENTED. Built-ins are only `name` (optional) + `email` (required); custom fields in side tables. Plan doc `CUSTOM_MERGE_FIELDS.md` implemented 2026-09-09. | memory `custom-fields-hybrid-model.md` |
| **Testing** | Playwright removed (2026-09-09). E2e + full journey covered by Vitest worker/integration tests with a test transport (jsdom). Concurrency tests hit a real isolated PostgreSQL. | memory `playwright-removed.md`, `testing-real-db-and-browser-journey.md` |
| **Templates feature** | Visual editor + plaintext both live. `TemplateEditorDialog` (full-screen overlay) is the create/edit surface. No starter picker, no template thumbnails on list, no saved-block library. **This plan adds the starter picker only.** | §2 below |
| **In-flight work** | Manual retry for FAILED email jobs (Retry button on `/emails` + "Retry all failed" on campaign detail) — implementation in progress as of 2026-09-15. Unrelated to this plan. | memory `manual-retry-failed-jobs.md` |

**Implication for this plan:** the system is green and Templatical is integrated, so the starter picker is a pure additive frontend feature (no stack changes, no new deps, no schema migration). The only external touchpoint is reusing the existing `renderTemplate()` pipeline for pre-generated thumbnail HTML (§7.4).

- `/templates` page: `app/(dashboard)/templates/page.tsx` — list-only. "New template" button opens `TemplateEditorDialog` with `templateId=null` (`page.tsx:111-114`).
- **No starter picker exists.** Grep across the whole repo for `starter|blank template|template picker|TemplatePicker|StarterTemplate` returns zero matches. `TEMPLATICAL_EMAIL_BUILDER.md` has no starter-template section (§17 "Out of scope" lists saved blocks + thumbnails only).
- Create/edit form: `components/templates/TemplateEditorDialog.tsx` (308 lines) — full-screen `fixed inset-0 z-50` overlay (L218). State: `name`, `subject`, `mode: 'visual' | 'plaintext'` (default `'visual'`, L57), `content: TemplateContent | null`, `plainBody: string`, `contentRef`. Save → `POST /api/templates` with `{ bodyJson }` (visual) or `{ body }` (plaintext) (L183-199).
- Visual/Plain text choice is an inline `role="tablist"` in the dialog header (L224-249). On edit, mode auto-detects from `body_json` presence (L119-132) but **both tabs stay visible and toggleable** — per project memory `template-editor-both-tabs-on-edit.md`. The starter picker must preserve this on edit.
- Visual editor: `components/templates/VisualEmailEditor.tsx` wraps `@templatical/editor` `init()` in Shadow DOM; loaded via `VisualEmailEditorLazy.tsx` (`dynamic(..., { ssr: false })`). `TemplateContent` and `MergeTagsConfig` types come from `@templatical/types`.
- Merge tags loaded from `GET /api/contact-fields` (L84-103); built-ins `[Name, Email]` + custom fields. Starters should use only `{{name}}` and `{{email}}` to stay merge-safe across all accounts.
- Template model (`prisma/schema.prisma:216-240`): `body_json` (source of truth, nullable Text), `body_mjml/body_html/body_text` (derived caches), `body` (deprecated legacy). **No schema change needed for starters** — a starter is just a seed value for `content`/`plainBody`.
- Existing card grid pattern: `components/templates/TemplateList.tsx:23` — `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`. Card style: `TemplateCard.tsx:22` — `rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4`.
- Existing tab/chip style reference: `TemplateEditorDialog.tsx:229-245` — active `bg-information text-white`, inactive `text-text-secondary hover:bg-selected`, `rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium`.
- `docs/` plan-doc convention: `UPPER_SNAKE_CASE.md` (confirmed: `TEMPLATICAL_EMAIL_BUILDER.md`, `CUSTOM_MERGE_FIELDS.md`, etc.).

## 3. How the modern world handles this

| Platform | Pattern |
|---|---|
| Mailchimp | Gallery grid: "Start from scratch" + "Paste code" + categorized starters (Welcome, Newsletter, Product, Event) with thumbnail previews |
| SendGrid | Categorized gallery + blank, thumbnails, search |
| Brevo | Gallery with category filter chips + blank |
| Loops / Resend (modern minimal) | Type-picker cards (Welcome, Newsletter, Transactional) with small preview, then editor |
| Postmark | Categorized starter gallery with live preview |

**Universal pattern:** a starter picker step *between* "New template" click and the editor. Not a separate route, not inline chips inside the editor — a gallery grid inside the existing overlay. This reduces blank-page paralysis and gives users a fast start.

## 4. Chosen approach (and rejected alternatives)

**Chosen: Starter picker step inside the existing `TemplateEditorDialog` (new-template path only).**

When `templateId` is null (create), the dialog shows the gallery first. User picks a starter → its seed loads into `content`/`plainBody`, `mode` is set to the starter's format, and the dialog switches to the editor view (current layout). When `templateId` is set (edit), skip the gallery and go straight to the editor — preserves the "both tabs on edit" rule.

| Alternative | Verdict | Reason |
|---|---|---|
| Separate `/templates/new` route + gallery page | Rejected | Breaks the list-only-page + overlay convention. Adds a route for one step. |
| Inline starter chips inside the editor (top row) | Rejected | Clutters the editor; only visible when content is empty; doesn't match the universal gallery pattern. |
| Starter templates stored in the DB (seeded via migration) | Rejected | Adds schema/migration surface for static content. Starters are static seeds — client-side constants are simpler and need **no new API endpoint** (per `prefer-existing-convention-over-new-abstraction.md` and the "reuse existing APIs" preference). |
| Gallery as a section on the `/templates` list page | Rejected | Mixes "your templates" with "starter templates" — confusing. Starters are not user-owned records. |

## 5. UI/UX spec

### 5.1 Layout (gallery step)

```
┌─────────────────────────────────────────────────────────────┐
│  New template                              [Cancel]         │  ← header (reuse existing)
├─────────────────────────────────────────────────────────────┤
│  Choose a starting point                                    │
│                                                             │
│  [All]  [Visual]  [Plain text]                              │  ← filter chips (tab style)
│                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                       │
│  │ Blank   │ │ Welcome │ │Newslett.│   (grid, reuse        │  ← TemplateList grid classes
│  │ Visual  │ │ Visual  │ │ Visual  │    TemplateCard style) │
│  └─────────┘ └─────────┘ └─────────┐                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                       │
│  │ Product │ │ Event   │ │ Passwd..│                       │
│  └─────────┘ └─────────┘ └─────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

- **Header:** "New template" + Cancel button (reuse existing header row style from `TemplateEditorDialog.tsx:219-257`). No Save button on the gallery step.
- **Title:** "Choose a starting point" (`text-lg font-semibold text-text-primary`).
- **Filter chips:** "All" | "Visual" | "Plain text" — inline the existing `role="tablist"` recipe from `TemplateEditorDialog.tsx:229-245` (active `bg-information text-white`, inactive `text-text-secondary hover:bg-selected`, `rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium`). **No new `TabList`/`SegmentedControl` primitive** — the codebase has only this one inline tablist (audited; no `components/ui/TabList.tsx` exists), so per `prefer-existing-convention-over-new-abstraction.md` we match the inline convention rather than extract a new abstraction. NOT a native `<select>` (per `all-dropdowns-reusable-custom-component.md`). Default selection: "All".
- **Grid:** reuse `TemplateList.tsx:23` classes — `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`.
- **Scroll:** gallery scrolls vertically inside the overlay; header is sticky.

### 5.2 Starter card

- **Container:** a plain native `<button>` (click selects, native keyboard behavior). Visual recipe from `TemplateCard.tsx:22`: `rounded-[var(--radius-md)] border border-neutral-200 bg-background p-4`; hover: `hover:bg-selected`. **No `aria-pressed`/`isSelected`** — picking a starter immediately replaces the gallery with the editor (§7.3), so the card never remains visible to show a selected state; a plain clickable button is sufficient and simpler. Structural reference: `ProviderSelector.tsx:17-37` (the codebase's only existing selectable card grid — audited). **No new `Card` primitive** — every feature card in the codebase is inline (audited: `TemplateCard`, `ContactCard`, `AttachmentCard`, `EmailAccountCard` all use the same recipe); per `prefer-existing-convention-over-new-abstraction.md`, match the inline convention.
- **Blank cards** (one Visual, one Plain text): visually distinct — dashed border (`border-dashed border-neutral-300`), centered "Start from scratch" label + format icon. Always first in the grid.
- **Preset cards:** thumbnail/preview area (top, ~3:2 aspect, `bg-selected` or `bg-neutral-50` background) + name (`font-medium text-text-primary`) + 1-line description (`text-sm text-text-secondary`) + format badge via **`Badge`** (`components/ui/Badge.tsx`) — `variant="information"` for Visual, `variant="default"` for Plain text. Reuse, not new.
- **Hover:** subtle elevation — `hover:shadow-sm hover:border-neutral-300` (matches existing hover conventions; verify against other cards in the app at implementation time).
- **Keyboard (V1):** each card is a native `<button>` element with normal Tab navigation — Tab moves focus card-by-card, Enter/Space (native button behavior) selects. **No roving tabindex, no arrow-key grid navigation in V1** (deferred to §9 — adds complexity for little gain at 10 starters; per `prefer-existing-convention-over-new-abstraction.md`, don't build roving tabindex if the codebase doesn't already have it). Filter chips are `role="tab"` in a `role="tablist"` (matches existing pattern).

### 5.3 Thumbnails

- **Visual starters:** render the starter's `TemplateContent` to HTML via `@templatical/renderer` + `mjml` (server-side, same pipeline as `app/api/templates/route.ts` POST) and show as a scaled-down preview (`transform: scale()` inside a fixed-height overflow-hidden box, or an `<iframe srcdoc>` at reduced size). **Pre-generated during development** using a manually run script (§7.4) and committed as string constants in `starterThumbnails.ts`; no runtime rendering cost. Re-run `npm run render:thumbnails` when starters change.
- **Plain text starters:** show a styled text snippet (monospace, `whitespace-pre-wrap`, truncated to ~6 lines) inside the thumbnail area.
- **Blank cards:** no thumbnail — a centered "+" icon or "Start from scratch" label.

**Decision (V1): pre-generated during development using a manually run script and committed to the repository.** No runtime rendering cost. Client-side lazy rendering is **only the documented fallback** (§10.2) if the Node script turns out to be technically incompatible with `renderTemplate()` outside a request context.

### 5.4 After picking

- Selected starter's seed loads into `content` (visual) or `plainBody` (plaintext); `mode` is set to the starter's format.
- Dialog switches to the existing editor layout (name + subject inputs + editor/textarea). The Visual/Plain text tablist in the header remains and stays toggleable (preserves `template-editor-both-tabs-on-edit.md`).
- Name field is **empty** — the user writes their own. Subject is **pre-filled from the starter's preset** (see §6.3); the user can edit it. Starters seed the body and subject only.
- **Format switching:** picking a starter seeds only its own format's state (`content` for visual, `plainBody` for plaintext); the other format's state stays empty. Toggling the Visual/Plain text tab switches to the other format's state, which may be empty — **no automatic conversion**. This matches the existing `TemplateEditorDialog` behavior (toggle just switches `mode`; `content` and `plainBody` are independent) and the both-tabs-on-edit rule (`template-editor-both-tabs-on-edit.md`). A future "convert to plain text" action (via the renderer's text fallback) is out of scope (§9).
- A "Back to templates" / "Choose a different starter" link is NOT added (keeps the flow one-way; user can Cancel and re-open). Reconsider if user testing asks for it.

## 6. Starter set (V1)

Only use merge tags `{{name}}` and `{{email}}` (safe across all accounts — built-ins per `custom-fields-hybrid-model.md`).

### 6.1 Visual (Templatical `TemplateContent`)

| ID | Name | Description | Body sketch |
|---|---|---|---|
| `blank-visual` | Start from scratch | Blank visual editor | empty `TemplateContent` |
| `welcome-visual` | Welcome email | Greet new subscribers | Logo/header + "Hi {{name}}" + welcome paragraph + primary CTA button + footer |
| `newsletter-visual` | Newsletter | Recurring content round-up | Header + intro + 2-3 article blocks (title + text + link) + footer |
| `product-visual` | Product announcement | Single product highlight | Header + product image + title + description + price + CTA + footer |
| `event-visual` | Event invitation | Date/time + RSVP | Header + event title + date/time + location + description + RSVP CTA + footer |
| `reset-visual` | Password reset | Transactional, single link | Minimal header + "Hi {{name}}, reset your password" + link button + footer |

### 6.2 Plain text

| ID | Name | Description | Body sketch |
|---|---|---|---|
| `blank-plaintext` | Start from scratch | Blank plain text | empty string |
| `welcome-plaintext` | Welcome (plain) | Simple greeting | `Hi {{name}},\n\nWelcome to ... Thanks for signing up.\n\n— The team` |
| `receipt-plaintext` | Receipt / confirmation | Order/booking confirm | `Hi {{name}},\n\nThis is your confirmation for ...\n\nDetails:\n...\n\nThanks!` |
| `notification-plaintext` | Notification | System alert | `Hi {{name}},\n\n[Alert summary]\n\nView details: [link]\n\n— The team` |

**Total: 10 starters (6 visual + 4 plaintext).** Small enough that search is unnecessary in V1 (defer to §9).

### 6.3 Subject presets (V1)

**Every starter has a `subject: string`.** When a starter is picked, the subject input is pre-filled from this value; the user can edit it (§5.4). Blank starters use an empty string (`''`) — the subject field starts empty, matching the blank-canvas intent. Preset starters use a suggested subject (e.g., "Welcome aboard, {{name}}" for welcome). Subject presets must use only `{{name}}`/`{{email}}` (never `{{company}}` or other non-built-in tags — per `custom-fields-hybrid-model.md`, built-ins are only `name` + `email`). This makes the type (§7.2), §5.4, and this section consistent.

## 7. Technical design

### 7.1 File layout

```
components/templates/
  TemplateEditorDialog.tsx        ← modified: add gallery step (create path only)
  StarterGallery.tsx              ← NEW: gallery grid + filter chips + grid container (reuses Badge, EmptyState, LoadingSpinner)
  StarterCard.tsx                 ← NEW: single selectable starter card (aria-pressed button; blank vs preset variants)
  starters/
    visualStarters.ts             ← NEW: visual TemplateContent seeds only (no generated HTML)
    plaintextStarters.ts          ← NEW: plaintext string seeds only
    starterThumbnails.ts          ← NEW: generated HTML map keyed by starter ID (visual only; written by the script)
    starterTemplates.ts           ← NEW: combines seeds + thumbnails into the typed Starter[] array consumed by the UI
```

No new route, no new API endpoint, no schema change, no migration.

### 7.2 Starter type (illustrative — verify against `@templatical/types` at implementation time)

```ts
// illustrative — exact TemplateContent shape must be verified against @templatical/types
import type { TemplateContent } from '@templatical/types';

type StarterFormat = 'visual' | 'plaintext';

interface VisualStarter {
  id: string;
  format: 'visual';
  name: string;          // card name
  description: string;   // 1-line card description
  subject: string;       // subject preset; blank starters use ''
  content: TemplateContent;          // seed for the editor
  thumbnailHtml?: string;            // pre-rendered HTML for the card preview; omitted on blank starters
}

interface PlaintextStarter {
  id: string;
  format: 'plaintext';
  name: string;
  description: string;
  subject: string;
  body: string;          // seed for the textarea
  // thumbnail derived from body at render time (no pre-render needed)
}

type Starter = VisualStarter | PlaintextStarter;
```

Per `dont-blindly-copy-plan-example-code.md`: the `TemplateContent` block structure in `visualStarters.ts` must be verified against the installed `@templatical/types` at implementation time. The plan only fixes the *principle* (starters are client-side constants of the right type); the exact JSON shape is an implementation detail.

### 7.3 Integration into `TemplateEditorDialog`

- Add a `step: 'gallery' | 'editor'` state (default `'gallery'` when `templateId` is null, `'editor'` when editing).
- On open with `templateId=null`: render `StarterGallery` instead of the editor body. Header shows "New template" + Cancel (no Save, no tablist).
- On open with `templateId` set: skip gallery, render editor as today.
- `StarterGallery` calls `onPick(starter)` → parent sets `content`/`plainBody`/`mode`/`subject` from the starter and switches `step` to `'editor'`.
- The existing `reset()` (L70-79) already clears state on open — extend it to also set `step` back to `'gallery'` for the create path.
- Save flow (L164-213) is unchanged: it reads `mode`, `contentRef`/`plainBody`, `name`, `subject` and POSTs/PATCHes as today. Starters only pre-fill these.

### 7.4 Thumbnail pre-render (visual starters)

- **Manually run script** (`scripts/render-starter-thumbnails.ts`), invoked via `npm run render:thumbnails` (add to `package.json` scripts). Run on demand when visual starters change; commit the generated output.
- **Not wired into `predev`/`prebuild`/`next build`** — rewriting a source file during every Next.js build is fragile (stale-build issues, watch-mode churn). Generation is an explicit, infrequent step.
- **Dependency flow (no circular imports):** the script imports `visualStarters.ts` (seeds only) → calls `renderTemplate()` (same server pipeline as `app/api/templates/route.ts` POST) on each seed → writes the resulting HTML map (keyed by starter ID) into `starterThumbnails.ts`. At runtime, `starterTemplates.ts` imports both `visualStarters`/`plaintextStarters` (seeds) and `starterThumbnails` (HTML) and combines them into the `Starter[]` array the UI consumes.
- **Card rendering:** the thumbnail HTML renders inside an `<iframe srcdoc={thumbnailHtml} sandbox="">` at reduced size. Iframe is safer (no CSS bleed) — prefer iframe. (Scaled-div with `transform: scale()` is the fallback if iframe has layout issues at card size — see §10.3.)

### 7.5 Reuse existing components & folder conventions (audited 2026-09-16)

**Audit source:** full `components/ui/` inventory (27 files) + `components/{feature}/` folder structure + `tests/unit/components/` tree.

**Reuse mapping — each gallery UI element → existing component:**

| Gallery UI element | Reuse? | Component / path | Notes |
|---|---|---|---|
| Page header + "New template" entry button | Reuse | `PageHeader` (`components/ui/PageHeader.tsx`) + `Button` (`components/ui/Button.tsx`) | Templates page currently uses an inline `<button>` for "New template" (`page.tsx:131-138`) instead of `Button` — **optional consistency fix**: switch to `<Button variant="primary">` to match Campaigns page (`page.tsx:261`). Low risk, improves uniformity. |
| Gallery container (overlay shell) | Reuse existing shell | `TemplateEditorDialog.tsx:218` full-screen overlay (`fixed inset-0 z-50 flex flex-col bg-background`) | The gallery is a *step inside* the existing overlay, NOT a new modal. `Dialog` (`components/ui/Dialog.tsx`) is `max-w-md` — too small for a gallery; do not use it. |
| Card grid container | Reuse pattern inline | `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` from `TemplateList.tsx:23` | Same grid classes as the templates list — visual consistency. |
| Starter card | New, follows existing pattern | `StarterCard.tsx` under `components/templates/` | Plain native `<button>` (click selects). No `aria-pressed` — the card disappears on selection (§7.3). Visual recipe from `TemplateCard.tsx:22`; structural reference `ProviderSelector.tsx:17-37`. No generic `Card` primitive exists; match inline convention. |
| Visual / Plain text format filter (chips) | New, inline | `role="tablist"` recipe from `TemplateEditorDialog.tsx:224-249` | No `TabList`/`SegmentedControl` primitive exists in `components/ui/`; inline the same recipe. |
| Format badge on a card | **Reuse** | `Badge` (`components/ui/Badge.tsx`) | `variant="information"` for Visual, `variant="default"` for Plain text. |
| Empty state (no search results) | **Reuse** | `EmptyState` (`components/ui/EmptyState.tsx`) | Props: `title`, `description?`, `action?`. No `icon` prop — render inline if an icon is needed. Unlikely in V1 (always 10 starters). |
| Loading state | **Reuse** | `LoadingSpinner` (`components/ui/LoadingSpinner.tsx`) | `size="lg"`. |
| Cancel / secondary action | **Reuse** | `Button variant="secondary"` (`components/ui/Button.tsx`) | |
| Confirm before discarding picked starter | **Reuse** | `ConfirmDialog` (`components/ui/ConfirmDialog.tsx`) | Only if "back to gallery" is added later (currently out of scope §9). |

**New reusable components introduced (feature-scoped, not global primitives):**
- `StarterGallery.tsx` — the gallery grid + filter chips + empty/loading states. Reusable within the templates feature; could generalize later if another feature needs a starter picker.
- `StarterCard.tsx` — a single selectable starter card with blank vs preset variants. Reusable within the feature.

**Explicitly NOT introduced (per `prefer-existing-convention-over-new-abstraction.md` — the codebase doesn't already have these, so extracting them would be a new abstraction, not a reuse):**
- No `Card` primitive in `components/ui/` — every feature card is inline today.
- No `TabList`/`SegmentedControl` in `components/ui/` — only one inline tablist exists today.
- No `FilterChipRow` in `components/ui/` — no chip-style filter exists today.

**Folder convention (confirmed):** `components/{feature}/` with PascalCase files. Starter files go under `components/templates/` alongside `TemplateCard.tsx`, `TemplateList.tsx`, `TemplateEditorDialog.tsx` — same feature, same folder. The `starters/` subfolder holds the data constants (seeds + thumbnails + combiner), keeping data separate from UI.

**Test convention (confirmed):** tests are NOT colocated; they live under `tests/unit/components/{feature}/` with `.test.tsx` naming. New tests:
- `tests/unit/components/templates/StarterGallery.test.tsx`
- `tests/unit/components/templates/StarterCard.test.tsx`
- `tests/unit/components/templates/starters/starterTemplates.test.ts` (data-shape assertions)

Use the existing test helper at `tests/unit/components/test-utils.tsx` and the Vitest + `@testing-library/react` + `userEvent` stack (see `TemplateCard.test.tsx:1-4` for the import pattern).

**Campaign wizard's template selector is a dropdown (`SearchableSelect`/`Select`), NOT a card grid** (`CampaignWizard.tsx:485-520`) — that picks a *saved template by name*, a different UX from picking a *prebuilt starter by thumbnail*. The starter gallery deliberately does NOT mirror the wizard's dropdown; it matches the `TemplateList` card grid + `ProviderSelector` selectable-button pattern instead.

## 8. What stays unchanged

- `/templates` list page, edit flow, preview dialog, delete flow, confirm/notice dialogs.
- All template API routes (`/api/templates`, `/api/templates/[id]`, `/preview`, `/upload-image`).
- `prisma/schema.prisma` Template model — no migration.
- `VisualEmailEditor`, `VisualEmailEditorLazy`, Templatical integration, renderer pipeline.
- Merge-tag loading from `/api/contact-fields`.
- Sending pipeline, EmailJob snapshot, MIME building.
- The Visual/Plain text tablist behavior on edit (both tabs visible and toggleable).

## 9. Out of scope (future phases)

- Search/filter by category beyond the 3 format chips (All/Visual/Plain text).
- More starters (e.g., re-engagement, abandoned cart, birthday) — add to the constant array, no architecture change.
- User-saved custom starters / "save as starter" from an existing template.
- Starter thumbnails on the `/templates` list page (distinct from this feature).
- AI-generated starter content.
- Arrow-key grid navigation + roving tabindex in the starter gallery (V1 uses native `<button>` + Tab — see §5.2).
- Localization of starter content (V1 ships English-only starters; users edit after picking).

## 10. Open questions / verify-at-implementation

1. **`TemplateContent` exact shape** — verify against installed `@templatical/types`. The plan assumes a `{ blocks: Block[] }`-style structure (the editor's `currentContent.blocks.length` check at `TemplateEditorDialog.tsx:174` implies this), but the block-level schema for each starter must be confirmed at implementation time.
2. **Thumbnail rendering path** — confirm `renderTemplate()` from `@templatical/renderer` + `mjml` can run in a Node script outside the Next request context (it should — it's a pure function). If not, fall back to client-side lazy render on first dialog open.
3. **Iframe vs scaled-div for thumbnail** — iframe (`srcdoc` + `sandbox=""`) is safer for CSS isolation; verify it renders at the small card size without layout issues. The preview dialog already uses `sandbox=""` iframes (`TemplatePreviewDialog.tsx`), so the pattern exists.
4. **Subject preset behavior** — confirm pre-filling subject doesn't conflict with any existing validation. The subject input is a plain `Input` with no special behavior (`TemplateEditorDialog.tsx:268-274`), so pre-fill is safe.
5. **Keyboard grid navigation** — V1 ships native `<button>` + Tab navigation (decided in §5.2). Arrow-key grid navigation with roving tabindex is deferred to §9 (future). No verification needed for V1.

## 11. Test plan

- **Unit (`vitest`):** `starterTemplates.ts` exports the expected 10 starters; all IDs are unique; all use only `{{name}}`/`{{email}}` merge tags (regex check on body/subject). **Non-blank starters** (id does not start with `blank-`): each visual starter has a non-empty `content` and `thumbnailHtml`; each plaintext starter has a non-empty `body`. **Blank starters** (id starts with `blank-`): `content` is empty (or `{ blocks: [] }`) / `body` is empty string, and no `thumbnailHtml`. Test path: `tests/unit/components/templates/starters/starterTemplates.test.ts`.
- **Component (`@testing-library/react` + `userEvent`):** `StarterGallery` renders all 10 cards by default; filter chips reduce the grid correctly; clicking a blank card calls `onPick` with empty content; clicking a preset card calls `onPick` with the starter's seed; keyboard Enter/Space selects the focused card (native `<button>` behavior). `StarterCard` renders blank vs preset variants correctly; native `<button>` click/Enter selects. Test paths: `tests/unit/components/templates/StarterGallery.test.tsx`, `tests/unit/components/templates/StarterCard.test.tsx`. Use `tests/unit/components/test-utils.tsx` helper.
- **Integration (existing template flow):** `TemplateEditorDialog` open with `templateId=null` shows gallery; open with `templateId` set skips gallery; picking a starter then saving POSTs the correct `bodyJson`/`body` (verify the payload shape matches the existing POST contract — no new fields).
- **Regression:** edit flow still auto-detects mode from `body_json` and shows both tabs toggleable (`template-editor-both-tabs-on-edit.md`).
- **No new API tests** — no API change.

## 12. Manual staging checklist (release gate)

1. `npm run dev` → open `/templates` → click "New template" → gallery appears with 10 cards.
2. Filter "Visual" → 6 cards; filter "Plain text" → 4 cards; "All" → 10 cards.
3. Click "Start from scratch" (Visual) → empty visual editor opens, mode tab on Visual.
4. Cancel, re-open, click "Welcome email" → editor opens with welcome content loaded, subject pre-filled, mode tab on Visual.
5. Click "Plain text" tab → switches to an **empty** textarea (the visual starter only seeded `content`, not `plainBody`; no auto-conversion — see §5.4). Toggle back to Visual → welcome visual content is preserved. This matches the existing editor behavior.
6. Save → template appears in `/templates` list → edit it → both tabs visible, gallery does NOT appear (edit skips gallery).
7. Reload the saved template → content loads correctly in the right mode.
8. Preview the saved template → renders correctly in the preview iframe.
9. Keyboard: Tab through cards, Enter selects; filter chips are reachable and toggle with Enter.
10. Run all four gates: `tsc`, `eslint`, `vitest`, `next build` — must be clean (per `verification-gate-after-implementation.md`).
