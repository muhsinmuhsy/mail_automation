# Custom merge fields — implementation plan (Path C)

> **Status:** PRODUCTION-READY (plan) — two reviews incorporated, awaiting implementation authorization.
> **Decision:** Path C (full Mailchimp-style user-defined custom merge fields), chosen because users have diverse and unpredictable goals; the field set cannot be hardcoded.
> **Approach:** Hybrid model (recommended) — see "Architecture decision" below.
> **Scope of this doc:** current system status, gap analysis, architecture decision, phased implementation plan, user journey, risks, verification gates, resolved decisions.

### Review 1 outcome (2026-09-07) — 8.5/10

External review proposed three changes. All three were **accepted** (with reasoning in §11):

1. **CSV unknown columns** → explicit "Create & Import" prompt, not silent auto-creation and not hard reject. Silent auto-create would pollute field config from messy CSVs (`internal_id`, `address_line_7`, …). Hard reject loses convenience. The prompt preserves both.
2. **Reserved tokens** → in addition to the 6 built-ins, reserve `id`, `user_id`, `contact_id`, `unsubscribe`, `unsubscribe_url`, `campaign`, `date`, and any token starting with `_`. Future-proofs against system merge tags (notably `unsubscribe`/`unsubscribe_url` for CAN-SPAM compliance) and database column names.
3. **Field deletion** → confirm dialog must show concrete counts: "Used by N templates. Values on M contacts." before cascade. Listing affected template names is a strong nice-to-have. The current "silent cascade, templates break" is a footgun.

A fourth point — stricter N+1 handling on the contact list (3-query pattern: field defs once → contacts → values by contact IDs) — was also **accepted** and replaces the looser wording in Phase 4.

### Review 2 outcome (2026-09-07) — production-readiness pass

Second review classified the plan as architecture/database/compat/performance/CSV/token/delete/validation all ✅, but flagged five ⚠️ areas that must be explicit before production. All five were **accepted** and are incorporated below:

1. **Authorization/ownership enforcement** — every `/api/contact-fields/*` and custom-field-related endpoint must scope queries by `user_id` from the auth context, never by `id` alone. Prevents User A from reading/modifying/deleting User B's fields. See §11.10.
2. **Transactional field deletion** — the count-then-delete sequence must be one `prisma.$transaction`, not independent operations. Prevents partial deletion on failure. See §11.11.
3. **Explicit type-coercion rules** — `field_type` changes must use explicit, testable coercion rules (not JS loose coercion). Values are user-controlled. See §11.12.
4. **Email/HTML injection safety** — custom field values enter outgoing emails. Must test that HTML/script-looking values and nested `{{token}}` values don't become executable. See §11.13.
5. **Resource limits** — cap custom fields per user, CSV columns, CSV rows, field name length, value length. Prevents a malicious/huge CSV from causing excessive DB work. See §11.14.

Plus two strengthening notes: **reserved tokens as a single central function** (§11.2 updated) and **security + concurrency integration tests** added to §9.

---

## 1. Current system and its status

### 1.1 What exists today

The contacts ↔ templates ↔ send-time substitution pipeline is already wired end-to-end. The plumbing is sound; only the field set is fixed.

**Data model** — `prisma/schema.prisma:132`
```
model Contact {
  id         String   @id @default(...)
  user_id    String   @db.Uuid
  name       String   @db.VarChar(100)
  email      String   @db.VarChar(255)
  company    String?  @db.VarChar(200)   // optional
  job_title  String?  @db.VarChar(200)   // optional
  notes      String?  @db.Text           // optional
  ...
}
```
Five built-in fields, all hardcoded columns. No user-extensible field mechanism.

**Validation** — `lib/validation/contact.ts`
- `createContactSchema` and `updateContactSchema` are static Zod objects. They accept `name, email, company, job_title, notes` only. No dynamic field support.

**Substitution engine** — `lib/email/template.ts`
- `SUPPORTED_TEMPLATE_VARIABLES = ['name', 'email', 'company', 'job_title', 'first_name']` (line 10) — hardcoded const.
- `replaceTemplateVariables(text, contact)` (line 27) — pure function, regex-based, resolves `{{token}}` against the contact object. Idempotent. Missing values are left as the literal `{{token}}` (no fallback syntax).
- `first_name` is derived from `name` (split on whitespace).

**Send-time wiring** — `lib/jobs/scheduler.ts:46-47`
```ts
subject: replaceTemplateVariables(template.subject, contact),
body:    replaceTemplateVariables(template.body, contact),
```
The scheduler already calls the substitution function per-recipient at job-generation time. This is the single integration point — extending it does not require new plumbing.

**Contacts UI**
- `app/(dashboard)/contacts/page.tsx` — list page with search, pagination, add/import toggles. `Contact` type on line 22 includes `company?: string`.
- `components/contacts/ContactForm.tsx:26-28` — renders `Name` (required), `Email` (required), `Company` (optional, no `required` attr). Line 22 sends `company: company || undefined`.
- `components/contacts/ContactCard.tsx` — renders **only** name and email. Does NOT display `company`, `job_title`, or `notes` even though the API returns them.
- `components/contacts/ContactImport.tsx:18` — helper text says CSV "should contain name, email, and company columns".

**Contacts API** — `app/api/contacts/route.ts`
- GET (line 27): `select: { id, name, email, company, job_title }` — explicitly selects a fixed set.
- POST (line 52-61): writes `name, email, company, job_title, notes` from the parsed body.
- Search (line 16-21): `OR: [name contains, email contains]` — only name and email are searchable. No filtering by company, job_title, or any other field.

**Templates UI**
- `app/(dashboard)/templates/page.tsx` — list page. `Template` type on line 19 is `{ id, name, subject, created_at }` — note: `body` is not even in the page-level type.
- `components/templates/TemplateForm.tsx:27-29` — three inputs: Template name, Subject, Body (plain `<Textarea>`). **No merge-tag picker** — authors must memorize `{{name}}`, `{{company}}`, etc.

**Tests**
- `tests/unit/email/template.test.ts` — covers `{{name}}`, `{{email}}`, `{{company}}`, `{{job_title}}`, `{{first_name}}`, whitespace-tolerant `{{ NAME }}`, unknown-token passthrough, and idempotency.
- `tests/integration/api/contacts-crud.test.ts`, `tests/integration/api/contacts-import-csv.test.ts` — CRUD + CSV import coverage.

### 1.2 Status summary

| Capability | Status |
|---|---|
| Fixed set of 5 contact fields | ✅ Working |
| `{{token}}` substitution at send time | ✅ Working |
| Per-recipient personalization in campaigns | ✅ Working |
| Company field collected and stored | ✅ Working |
| Company field displayed on contact card | ❌ Not shown (ContactCard renders only name + email) |
| `job_title` / `notes` surfaced in UI | ❌ Not shown |
| User-defined custom fields | ❌ Not supported |
| Merge-tag picker in template editor | ❌ Not supported |
| Fallback values (`{{x:default}}`) | ❌ Not supported |
| Conditional blocks (`{{#if x}}`) | ❌ Not supported |
| Segmentation by company / custom fields | ❌ Not supported (search is name + email only) |
| Onboarding / audience-field setup wizard | ❌ Does not exist |

### 1.3 Pre-existing test status (for verification context)

- `CampaignDetails` and `CampaignWizard` tests fail on the unmodified codebase — confirmed pre-existing via `git stash` on 2026-09-07, not regressions from this work.
- `next build` fails environmentally (PostCSS sandbox issue). Use `npx tsc --noEmit` + `npx eslint .` + `npm test` as verification gates instead.

---

## 2. Gap vs Mailchimp

Mailchimp's merge-tag model has three pillars this codebase lacks:

1. **User-defined merge fields.** A user defines their own fields (PLAN, SHOE_SIZE, SIGNUP_DATE, …) in an audience-settings screen. The field set is per-user, not hardcoded.
2. **Dynamic token set in templates.** Templates reference any defined field via `*|FIELD|*` (Mailchimp syntax) or `{{field}}` (this codebase's syntax). The token set is queried from the user's field definitions, not from a const array.
3. **Self-serve field lifecycle.** Adding, renaming, reordering, making required, and deleting a field is done by the user through the UI — no developer, no migration, no redeploy.

Secondary Mailchimp features also missing: fallback values (`*|FNAME:there|*`), conditional blocks (`*|IF:X|*…*|END:IF|*`), and segmentation by any field. These are **out of scope for Path C** but noted as future enhancements (Path B).

---

## 3. Architecture decision

### 3.1 Hybrid model (recommended)

Keep the five existing columns (`name, email, company, job_title, notes`) on `Contact` exactly as-is. Add a new side table for **user-defined custom fields only**.

- **Pros:** Zero disruption to existing code. `ContactForm`, `ContactCard`, `replaceTemplateVariables`, the scheduler, and all 30+ Prisma-generated references to `contact.company` keep working untouched. Custom fields are purely additive — you only pay for what users actually extend.
- **Cons:** Two code paths for "built-in field" vs "custom field" in a few places (the merged-contact builder, the merge-tag picker list).

### 3.2 Full migration (rejected)

Move every field (including company, job_title, notes) into `ContactField` + `ContactFieldValue` rows. More "pure" but rips through every file that references `contact.company`, `contact.name`, etc. Higher risk, larger blast radius, no user-facing benefit over hybrid.

**Decision: Hybrid.** This is the approach the rest of this document assumes.

---

## 4. Implementation plan (phased, in dependency order)

### Phase 1 — Data model & migration

**Files:**
- `prisma/schema.prisma` — add two models:
  - `ContactField`:
    - `id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
    - `user_id String @db.Uuid` + relation to `User` (onDelete: Cascade)
    - `name String @db.VarChar(50)` — the token, e.g. `size`. Lowercase, alphanumeric + underscore. Unique on `(user_id, name)`. **Must not collide with reserved tokens** (see §11.2 for the full reserved list).
    - `label String @db.VarChar(100)` — display label, e.g. "T-shirt Size". Mutable.
    - `field_type FieldType` — enum: `text | number | date | boolean`.
    - `sort_order Int @default(0)`
    - `is_required Boolean @default(false)`
    - `is_default Boolean @default(false)` — reserved for future seeded defaults; not used in hybrid model.
    - `created_at`, `updated_at` timestamps.
  - `ContactFieldValue`:
    - `id String @id @default(...) @db.Uuid`
    - `contact_id String @db.Uuid` + relation to `Contact` (onDelete: Cascade)
    - `field_id String @db.Uuid` + relation to `ContactField` (onDelete: Cascade)
    - `value String?` — stored as text; interpretation depends on `field_type`. Nullable for optional fields.
    - `created_at`, `updated_at` timestamps.
    - Unique on `(contact_id, field_id)`.
- Add `contact_fields ContactField[]` and `contact_field_values ContactFieldValue[]` relations to `Contact` and `User`.
- New Prisma migration under `prisma/migrations/` following the existing `YYYYMMDD_description` naming convention.

**Seed:** None. The side table starts empty. Built-in fields stay as columns; users add custom fields via the UI.

**Verification gate:**
- `npx prisma migrate dev --name add_custom_contact_fields` succeeds.
- `npx prisma generate` regenerates the client without error.
- Existing test suite still passes (no behavioral change yet).

---

### Phase 2 — Substitution engine

**Files:**
- `lib/email/template.ts` — keep `SUPPORTED_TEMPLATE_VARIABLES` and `replaceTemplateVariables` unchanged in signature. The 5 built-ins continue to resolve from the contact object.
- New `lib/email/template-contact.ts` — `buildTemplateContact(contact, fieldValues): TemplateContact`:
  - Flattens built-in fields (`name, email, company, job_title`) from the contact.
  - Flattens custom field values into top-level keys by their `name` token (e.g. `{ size: "M", plan: "Pro" }`).
  - Returns a single object the existing `replaceTemplateVariables` can consume without modification.

**Why this shape:** keeps `replaceTemplateVariables` pure and unchanged. The merge logic lives in one testable helper. The scheduler call site changes minimally.

**Tests:** extend `tests/unit/email/template.test.ts` with cases for custom tokens (`{{size}}`, `{{plan}}`) and add a new test file for `buildTemplateContact`.

**Email/HTML injection safety tests (mandatory — see §11.13):** custom field values enter outgoing emails. Add explicit test cases:
- Token variants: `{{size}}`, `{{ size }}`, `{{SIZE}}` (case-insensitivity), `{{unknown}}` (passthrough), `{{name}}{{size}}` (adjacent tokens).
- Value containing a token: `contact.size = "{{plan}}"` — must NOT recursively resolve; the literal `{{plan}}` goes into the email, not the plan value. (Current engine is non-recursive by design — verify with a test.)
- Value containing HTML/script: `contact.size = "<script>alert(1)</script>"` — the substituted email body contains the literal string; it must NOT become executable HTML/JS. The correct mitigation depends on how the email body is rendered/sanitized downstream (MIME generation in `lib/email/mime.ts`). At minimum, document the substitution engine's behavior and add a test asserting no recursive resolution.

**Verification gate:** `npx tsc --noEmit` clean; `npm test -- template` green.

---

### Phase 3 — Dynamic validation

**Files:**
- `lib/validation/contact.ts` — convert `createContactSchema` and `updateContactSchema` from static consts to builder functions:
  - `buildCreateContactSchema(customFields: ContactField[]): z.ZodObject`
  - `buildUpdateContactSchema(customFields: ContactField[]): z.ZodObject`
  - Base schema stays the same (name, email, company, job_title, notes).
  - For each custom field, add a key typed by `field_type`:
    - `text` → `z.string().max(200).optional()` (or `.nonempty()` if `is_required`)
    - `number` → `z.coerce.number().optional()` (or required)
    - `date` → `z.string().datetime().optional()` (ISO 8601)
    - `boolean` → `z.boolean().optional()`
- Keep `importCsvSchema` as-is for now; CSV mapping changes in Phase 5.
- Preserve `CreateContactInput` / `UpdateContactInput` type exports — they become the base inputs; a separate `CustomFieldValues` type covers the dynamic part.

**Explicit type-coercion rules (mandatory — see §11.12):** when `field_type` is changed on an existing field, coercion must use explicit, testable rules — NOT JS loose coercion (`Number()`, `Boolean()`) because values are user-controlled:
- `text → number`: `"123"` ✅, `"12.5"` ✅, `""` ✅ (→ null), `"abc"` ❌ reject. Use `z.coerce.number()` or a regex `/^-?\d+(\.\d+)?$/`.
- `text → date`: `"2026-09-07"` ✅, `"2026-09-07T10:00:00Z"` ✅, `"hello"` ❌ reject. Use `z.string().datetime()` or `Date.parse()` with NaN check.
- `text → boolean`: `"true"` ✅, `"false"` ✅ (case-insensitive), `"1"`/`"0"` ✅, `"maybe"` ❌ reject. Explicit allowlist, not `Boolean(value)`.
- `number → text`: always ✅ (toString).
- `date → text`: always ✅ (toISOString).
- `boolean → text`: always ✅ (toString).
- If ANY existing value fails coercion, reject the type change with a clear error listing the offending values (capped at ~5).

**Verification gate:** `npx tsc --noEmit` clean; new unit tests for the builder functions covering each field type, required/optional combinations, and every coercion rule above.

---

### Phase 4 — API

**New routes:**
- `app/api/contact-fields/route.ts`
  - `GET` — list the user's `ContactField` definitions, ordered by `sort_order`. **Scoped:** `where: { user_id: ctx.user.id }`.
  - `POST` — create a field. **Scoped:** set `user_id: ctx.user.id` on the created row. Validate `name` (lowercase, alphanumeric + underscore, 1-50 chars, no collision with reserved tokens per §11.2). Validate `label` (non-empty, ≤100 chars). Validate `field_type` is one of the enum values. **Enforce resource limits** (§11.14): reject if the user already has `MAX_CUSTOM_FIELDS_PER_USER` fields. Rate-limit key: `contact-field-create`.
- `app/api/contact-fields/[id]/route.ts`
  - **Authorization (mandatory — see §11.10):** every query on these routes must include `user_id: ctx.user.id` in the `where` clause, NOT just `id`. This prevents User A from reading/modifying/deleting User B's fields via `PATCH /api/contact-fields/<User B's field ID>`. The existing `defineRoute({ auth: 'user' })` pattern (used in `app/api/contacts/route.ts:9,38`) provides `ctx.user.id` — use it.
    ```ts
    // CORRECT
    where: { id: fieldId, user_id: ctx.user.id }
    // WRONG — allows cross-user access
    where: { id: fieldId }
    ```
  - `PATCH` — update `label`, `sort_order`, `is_required`. Changing `field_type` only allowed if existing values coerce to the new type per the explicit rules in Phase 3. `name` (token) is immutable after creation (templates depend on it). **Transactional:** if type change requires migrating values, do it in `prisma.$transaction`.
  - `DELETE` — **single transaction** (see §11.11):
    ```ts
    await prisma.$transaction(async (tx) => {
      // 1. Verify ownership (throws if not found or not owned)
      const field = await tx.contactField.findFirstOrThrow({
        where: { id: fieldId, user_id: ctx.user.id },
        select: { name: true },
      });
      // 2. Delete all values
      await tx.contactFieldValue.deleteMany({ where: { field_id: fieldId } });
      // 3. Delete the field definition
      await tx.contactField.delete({ where: { id: fieldId } });
    });
    ```
    Before the transaction, return usage counts for the confirmation dialog:
    - `template_usage_count` — number of templates whose `subject` or `body` contains `{{token}}` (substring match).
    - `contact_value_count` — number of `ContactFieldValue` rows for this field.
    - `affected_template_names` — names of the templates above (for display; cap at ~10, then "… and N more").
    The client `ConfirmDialog` shows: "This field is used by N templates. Deleting it will remove its values from M contacts. Templates will no longer resolve `{{token}}`." On confirm, run the transaction above.

**Modified routes:**
- `app/api/contacts/route.ts`
  - `GET` — **use the 3-query pattern** to avoid N+1 on large lists:
    1. Fetch the user's `ContactField` definitions once (small, bounded, cacheable).
    2. Fetch the page of contacts (built-in columns only).
    3. Fetch `ContactFieldValue` rows for those contact IDs (one query, `WHERE contact_id IN (...)`).
    4. Build the response by joining values onto contacts in application code.
    Do NOT use `include: { contact_field_values: { include: { field: true } } } }` on the list endpoint — it re-fetches the field definition per row. The nested include is acceptable on single-contact fetches and on the scheduler's bounded batch.
  - `POST` — fetch user's `ContactField` rows, build dynamic schema via Phase 3, parse, then `prisma.$transaction` to create `Contact` + `contactFieldValue.createMany` for any custom values present in the body.
- `app/api/contacts/[id]/route.ts`
  - `PATCH` — same dynamic validation; update built-in columns and upsert/delete custom field values in a transaction.
- `app/api/contacts/import-csv/route.ts`
  - Map CSV columns by header name. Built-in headers (`name, email, company, job_title, notes`) map to columns. Any other header maps to a custom field by `name` token if one exists.
  - **Unknown columns (no matching built-in or custom field):** do NOT silently auto-create and do NOT hard reject. Return a structured response listing the unknown columns so the client can show a confirmation prompt:
    ```
    Unknown columns in CSV:
    • shoe_size
    • plan

    Create these custom fields (as text) and import?
    [ Create & Import ]  [ Cancel ]
    ```
    On "Create & Import", the client re-POSTs with a flag authorizing creation; the server creates the `ContactField` rows (as `field_type: text`) inside the same transaction as the contact import. This keeps field creation explicit while preserving import convenience.
  - **Resource limits (mandatory — see §11.14):** reject the CSV before processing if:
    - Column count exceeds `MAX_CSV_COLUMNS` (e.g. 100).
    - Row count exceeds `MAX_CSV_ROWS` (e.g. 50,000).
    - Creating the unknown columns would exceed `MAX_CUSTOM_FIELDS_PER_USER`.
    - Any field name exceeds `MAX_FIELD_NAME_LENGTH` (50 chars).
    - Any value exceeds `MAX_FIELD_VALUE_LENGTH` (e.g. 10,000 chars).
    Return a clear error listing which limit was hit. This prevents a malicious or accidentally huge CSV from causing excessive database work.

**Verification gate:** existing `tests/integration/api/contacts-crud.test.ts` and `contacts-import-csv.test.ts` still pass unchanged (backward compat). New integration tests for the `contact-fields` routes (create, list, update, delete, token-collision rejection, type-change rejection). **Security tests (mandatory — see §9):** cross-user authorization tests (User A cannot read/update/delete User B's fields or write values into them). **Concurrency tests:** simultaneous creation of the same token (expect clean P2002 conflict handling), simultaneous update of the same field, delete while a contact update is in flight.

---

### Phase 5 — UI

**UI audit (mandatory before implementation):** match existing patterns — `Input`, `Textarea`, `Button`, `Pagination`, `EmptyState`, `LoadingSpinner`, `ConfirmDialog`, the card grid layout in `contacts/page.tsx`, the form-in-bordered-card pattern. Do not introduce divergent components.

**New page:** `app/(dashboard)/settings/fields/page.tsx`
- Lists the user's `ContactField` definitions in a card grid or table (match existing list-page pattern).
- "Add field" button toggles an inline form (match the `showAddContact` pattern in `contacts/page.tsx`).
- Per-field actions: edit label, reorder, toggle required, delete (via `ConfirmDialog` showing template-usage count + contact-value count + affected template names per Phase 4 `DELETE`).
- Built-in fields (name, email, company, job_title, notes) shown as locked/non-editable rows for clarity.

**Modified components:**
- `components/contacts/ContactForm.tsx`
  - Accept a `fields: ContactField[]` prop.
  - After the 3 built-in inputs, render one `Input` per custom field, ordered by `sort_order`. Required-ness from `field.is_required`. Input type from `field.field_type` (text → `Input`, number → `Input type="number"`, date → `Input type="date"`, boolean → a checkbox/toggle — match existing pattern if one exists, else use `Input`).
  - Submit body includes custom field values keyed by token name.
- `components/contacts/ContactCard.tsx`
  - After name + email, render a small "fields" section showing custom field label/value pairs for non-empty values. Keep the card visually consistent with the existing layout.
  - (Optional, separate decision: also surface `company` and `job_title` here — they're currently returned by the API but not displayed.)
- `components/contacts/ContactImport.tsx`
  - Update helper text on line 18: "CSV should contain name, email, and any custom field columns by their token name (e.g. `size`, `plan`). Unknown columns will prompt you to create them as fields before importing."
  - On import, if the API returns unknown columns, show a confirmation dialog listing them with "Create & Import" / "Cancel" actions (match existing `ConfirmDialog` pattern).
- `components/templates/TemplateForm.tsx`
  - Add a merge-tag picker (small dropdown or popover button) above the `Body` textarea.
  - Lists built-in tokens (`{{name}}`, `{{email}}`, `{{company}}`, `{{job_title}}`, `{{first_name}}`) + the user's custom field tokens (`{{size}}`, `{{plan}}`, …).
  - Each entry shows **label + token**, e.g. "Size ({{size}})" — helps authors who know the field by its display label. Built-ins show their natural name, e.g. "Company ({{company}})".
  - Clicking a token inserts it at the cursor position in the textarea.
  - Fetch the user's fields via `GET /api/contact-fields` on mount.
  - Match existing `Button` + `Input` styling for the picker trigger.

**Verification gate:** `npx tsc --noEmit` clean; `npx eslint .` clean. New component tests under `tests/unit/components/contacts/` (dynamic form rendering, required validation, card field display) and `tests/unit/components/templates/` (picker renders correct tokens, inserts at cursor). UI audit sign-off: new components match existing patterns.

---

### Phase 6 — Scheduler (send-time wiring)

**Files:**
- `lib/jobs/scheduler.ts`
  - Line 21-23: change `prisma.contact.findMany` to `include: { contact_field_values: { include: { field: true } } } }`.
  - Before calling `replaceTemplateVariables` on lines 46-47, call `buildTemplateContact(contact, contact.contact_field_values)` from Phase 2.
  - The substitution call sites stay otherwise identical:
    ```ts
    const templateContact = buildTemplateContact(contact, contact.contact_field_values);
    subject: replaceTemplateVariables(template.subject, templateContact),
    body:    replaceTemplateVariables(template.body, templateContact),
    ```

**Verification gate:** new unit test for `generateCampaignJobs` with a contact that has custom field values, asserting the scheduled `subject` and `body` contain the substituted custom values.

---

### Phase 7 — Final verification

- `npx tsc --noEmit` — typecheck clean.
- `npx eslint .` — lint clean.
- `npm test` — all green except the known pre-existing campaign failures (`CampaignDetails`, `CampaignWizard` — see §1.3).
- Do NOT use `next build` as a gate (environmental sandbox failure — see §1.3).
- Manual smoke test:
  1. Create a custom field "Size" (token `size`, type `text`) via `/settings/fields`.
  2. Add a contact with `size = "M"`.
  3. Write a template with body `Available in size {{size}}`.
  4. Send a campaign to that contact.
  5. Confirm the received email says "Available in size M".

---

## 5. Execution order (dependency graph)

```
Phase 1 (schema + migration)
   │
   ├──> Phase 2 (substitution helper)   ─┐
   ├──> Phase 3 (dynamic validation)     ─┤
   │                                      ├──> Phase 4 (API) ──> Phase 6 (scheduler)
   │                                      │
   └──> Phase 5 (UI)  ────────────────────┘

Phase 7 (verification) runs continuously and finally at the end.
```

- Phase 1 blocks everything.
- Phases 2, 3, and 5 can proceed in parallel once Phase 1 lands.
- Phase 4 depends on 2 + 3.
- Phase 6 depends on 2 + 4.
- Phase 7 is continuous but final.

---

## 6. User journey — adding a "Size" field

This is what an end user does after Path C ships. **No developer, no migration, no redeploy.**

1. User opens `/settings/fields` (the new audience-fields page).
2. Clicks "Add field". Form appears:
   - Field name (token): `size` — lowercase, alphanumeric + underscore, must not collide with built-ins.
   - Display label: `Size` — mutable later without breaking templates.
   - Field type: `text` (or `number`).
   - Required: No.
   - Sort order: `5`.
3. Saves. POST to `/api/contact-fields` creates one `ContactField` row.
4. **Automatically, with no further user action:**
   - `/contacts` "Add contact" form now shows a "Size" input below Company.
   - `/contacts` contact cards show "Size: M" for contacts that have a value.
   - `/contacts` CSV import accepts a `size` column header and maps it.
   - `/templates` merge-tag picker lists `{{size}}` alongside the built-ins.
   - `POST /api/contacts` validation accepts a `size` key in the body.
   - At campaign send time, `{{size}}` in any template is replaced per-recipient.
5. User adds a contact with `size = "M"`.
6. User writes a template `Available in size {{size}}`.
7. User sends a campaign; the email goes out as "Available in size M".

**Later, the user can:** rename the label ("Size" → "T-shirt Size"), reorder it, make it required (only enforced on new/updated contacts), change type (only if existing values are coercible), or delete it (cascades to all values; templates containing `{{size}}` will then leave the literal `{{size}}` in sent emails).

---

## 7. Contrast — today vs Path C

To add a "Size" field **today**, a developer must:
1. Add `size String? @db.VarChar(100)` to `prisma/schema.prisma`.
2. Run `prisma migrate dev` → new migration file.
3. Add `size: z.string().max(100).optional()` to `lib/validation/contact.ts`.
4. Add `<Input label="Size" ...>` to `components/contacts/ContactForm.tsx`.
5. Add `'size'` to `SUPPORTED_TEMPLATE_VARIABLES` in `lib/email/template.ts`.
6. Add `size: true` to the Prisma `select` in `app/api/contacts/route.ts`.
7. Update `ContactCard.tsx` to display it.
8. Update CSV import mapping.
9. Run typecheck, lint, tests, redeploy.

**9 steps, a migration, and a deploy for one field.**

With Path C, the user does step 2 in §6 above and everything else is automatic. That is the Mailchimp difference.

---

## 8. Risk callouts

1. **Migration safety** — `ContactFieldValue` is purely additive; no backfill. Existing contacts simply have no custom values. Low risk.
2. **Token collision + reserved tokens** — the `contact-fields` POST route must reject names matching built-ins (`name`, `email`, `company`, `job_title`, `first_name`, `notes`) **and** reserved system tokens (`id`, `user_id`, `contact_id`, `unsubscribe`, `unsubscribe_url`, `campaign`, `date`, and any token starting with `_`). The reserved list protects future system merge tags (notably `unsubscribe`/`unsubscribe_url` for CAN-SPAM compliance) and database column names. Enforce server-side; the full reserved list is in §11.2.
3. **Token immutability** — `name` (the token) must be immutable after creation because templates reference it. Only `label` is mutable.
4. **CSV import backward compat** — existing CSVs with `name,email,company` columns must still import cleanly. Do not break the happy path while adding custom-column mapping. Unknown columns trigger an explicit "Create & Import" prompt, not silent auto-creation.
5. **Performance — N+1 on contact list** — use the 3-query pattern (field defs once → contacts → values by contact IDs) on the list endpoint, NOT nested `include`. Nested include is acceptable on single-contact fetches and the scheduler's bounded batch. See Phase 4 `GET` for details.
6. **Delete semantics** — deleting a `ContactField` cascades to all `ContactFieldValue` rows. The `ConfirmDialog` must show concrete counts (N templates using `{{token}}`, M contacts with values) and ideally the affected template names before the user confirms. Templates containing `{{token}}` will subsequently leave the literal token in sent emails — the dialog must state this. (Mitigation: Path B's fallback syntax — out of scope here.)
7. **Type change semantics** — changing `field_type` after values exist is dangerous. Allow only if all existing values coerce cleanly to the new type per the explicit rules in Phase 3; else reject with a clear error listing offending values.
8. **UI consistency** — per the user's standing preference, audit `Input`, `Button`, `EmptyState`, the card grid, and the form-in-bordered-card patterns before writing any new UI. Do not invent new components.
9. **Authorization / cross-user access (production-critical)** — every `/api/contact-fields/*` query must scope by `user_id: ctx.user.id`, never by `id` alone. Without this, User A can read/modify/delete User B's fields. See §11.10. Enforce in every route; test with cross-user integration tests.
10. **Transactional field mutation** — field deletion and type-change-with-migration must be single `prisma.$transaction` operations. Independent count-then-delete steps risk partial deletion on failure. See §11.11.
11. **Email/HTML injection via custom values** — custom field values are user-controlled and enter outgoing emails. The substitution engine must NOT recursively resolve `{{token}}` inside a value, and HTML/script-looking values must not become executable. Test explicitly. See §11.13.
12. **Resource exhaustion via CSV** — a malicious or accidentally huge CSV (many columns, many rows, long values) can cause excessive DB work. Enforce limits before processing. See §11.14.

---

## 9. Verification gates (per standing expectation)

Every phase must pass before moving on:
- `npx tsc --noEmit` — typecheck.
- `npx eslint .` — lint.
- `npm test` — unit + integration tests. Pre-existing campaign failures (§1.3) are acceptable; any new failure is a regression and blocks.
- `next build` is NOT a gate (environmental failure — §1.3).
- New code must have corresponding tests. Modified code must have updated tests.
- UI changes must pass the UI-consistency audit (§8, item 8).
- **Security tests (mandatory for Phase 4):** integration tests asserting cross-user isolation — User A cannot GET/PATCH/DELETE User B's `ContactField`, cannot write `ContactFieldValue` into User B's field, and cannot import into User B's field definitions. These follow the existing integration-test pattern in `tests/integration/api/`.
- **Concurrency tests (mandatory for Phase 4):** simultaneous same-token creation (expect clean P2002 conflict error, not a crash), simultaneous same-field update, delete-while-contact-update-in-flight. The DB uniqueness constraint on `(user_id, name)` protects the first; the API must handle the resulting Prisma error gracefully.

---

## 10. Out of scope (future enhancements — Path B)

These Mailchimp features are intentionally excluded from Path C to keep scope bounded:
- **Fallback values** (`{{company:there}}`) — Easy, ~10 lines in `lib/email/template.ts`.
- **Conditional blocks** (`{{#if company}}…{{/if}}`) — Medium, requires a small parser.
- **Segmentation by custom fields** in the contacts list filter — Medium, extends the `where` builder in `app/api/contacts/route.ts`.
- **Default merge-field seeding** for new users — defer until usage patterns are known.

These can be layered on top of Path C later without re-architecting.

---

## 11. Resolved decisions

All open questions have been resolved (2026-09-07) based on external review + maintainer judgment. Implementation may proceed per these decisions.

### 11.1 CSV unknown-column behavior → explicit "Create & Import" prompt

**Decision:** When a CSV has column headers that don't match any built-in or existing custom field, the API returns a structured response listing the unknown columns. The client shows a confirmation dialog:

```
Unknown columns in CSV:
• shoe_size
• plan

Create these custom fields (as text) and import?
[ Create & Import ]  [ Cancel ]
```

On "Create & Import", the server creates the `ContactField` rows (as `field_type: text`) inside the same transaction as the contact import.

**Why not silent auto-create:** a messy CSV with 20 columns would silently create 20 fields (`internal_id`, `address_line_7`, `phone2`, …) and pollute the user's field configuration. Field creation must be explicit.

**Why not hard reject:** loses the convenience of Mailchimp-style importing. The prompt preserves both safety and convenience.

### 11.2 Reserved tokens → built-ins + system tokens + `_` prefix

**Decision:** The `contact-fields` POST route rejects any `name` matching:

- **Built-in field names:** `name`, `email`, `company`, `job_title`, `first_name`, `notes`
- **System/database tokens:** `id`, `user_id`, `contact_id`, `campaign`, `date`
- **Future email-compliance tokens:** `unsubscribe`, `unsubscribe_url`
- **Reserved prefix:** any token starting with `_` (namespace for future system tokens)

**Why:** `id`/`user_id`/`contact_id` are database columns that must never be exposed as merge tags. `unsubscribe`/`unsubscribe_url` will almost certainly be needed for CAN-SPAM compliance (every marketing email requires a one-click unsubscribe link). `campaign` and `date` are likely future system merge tags. The `_` prefix gives a clean namespace for future system tokens without enumerating them all now. Low cost, high future-proofing.

**Implementation:** define the reserved list in **one central place** — e.g. `lib/validation/merge-field-names.ts` exporting `isReservedMergeFieldName(name: string): boolean` and `BUILTIN_MERGE_FIELD_NAMES`. The API route, the validation schema builder, and the UI picker all import from this single source. Do NOT duplicate the list across three locations — divergence between them is a security bug waiting to happen.

### 11.3 Field types for V1 → text, number, date, boolean

**Decision:** Ship with `text | number | date | boolean` only. Do NOT add `picklist` (enum with allowed values), `address` (multi-line), `url`, or `email` types until a concrete UI requirement exists.

**Why:** the four-type set covers the vast majority of use cases. Each additional type adds validation, input-control, and CSV-coercion surface area. Ship narrow, expand on demand.

### 11.4 Per-user vs per-workspace → per-user

**Decision:** Custom fields are scoped to a single user (`user_id` on `ContactField`).

**Why:** the current schema has no workspace/team model — `Contact.user_id` is the only ownership boundary. If multi-user workspaces are added later, `ContactField.user_id` would become `ContactField.workspace_id` and require a migration. That's a separate decision; don't pre-build for it.

### 11.5 Required-field enforcement on existing contacts → allow, enforce on new/updated only

**Decision:** A user can make an existing field `is_required` at any time. The change is allowed even if existing contacts lack a value. Enforcement applies only to new contacts and updates to existing contacts.

**Nice-to-have (not blocking):** the settings UI surfaces a non-blocking warning when toggling required on: "N existing contacts are missing this value. They will not be required to backfill." This is informational only.

**Why:** blocking the change until backfill forces the user to do bulk data entry before they can tighten validation — bad UX. Silently allowing it without warning hides the gap — the warning is the middle ground.

### 11.6 Merge-tag picker display → label + token

**Decision:** Each entry in the picker shows the display label followed by the token in parentheses, e.g. "Size ({{size}})", "Company ({{company}})".

**Why:** authors think in labels ("I want to insert the Size"), but need the token to recognize it in the template body. Showing both bridges the gap without forcing the author to memorize tokens.

### 11.7 ContactCard display → custom fields only this scope; built-ins separate

**Decision:** In this scope, `ContactCard` shows custom field label/value pairs only. Surfacing the hidden built-ins (`company`, `job_title`) on the card is a separate small change, not part of Path C.

**Why:** keeps the scope of this change bounded to the custom-fields feature. The built-in display gap is pre-existing and independent.

### 11.8 Settings page route → `/settings/fields`

**Decision:** The field-management page lives at `/settings/fields`.

**Why:** `/settings/` is the conventional location for configuration. It keeps field definitions out of the contacts list page (which is for managing contact *data*, not schema). If a top-level settings area doesn't exist yet, it's reasonable to create it as part of this work.

### 11.9 Rate limiting → yes, dedicated keys

**Decision:** `contact-field-create`, `contact-field-update`, and `contact-field-delete` each get dedicated rate-limit keys, following the existing `rateLimitKey` pattern in `app/api/contacts/route.ts:71`.

**Why:** field-definition mutations are infrequent but high-impact (they affect all contacts and templates). Rate-limiting prevents abuse without burdening normal use.

### 11.10 Authorization / ownership enforcement → scope every query by user_id

**Decision:** Every `/api/contact-fields/*` endpoint and every contact endpoint that touches custom field values must scope its Prisma `where` clause by `user_id: ctx.user.id` from the auth context — never by `id` alone.

**Concrete requirement:**
```ts
// CORRECT — on [id] routes
where: { id: fieldId, user_id: ctx.user.id }
// WRONG — allows cross-user access
where: { id: fieldId }
```

This applies to: `GET /api/contact-fields`, `POST /api/contact-fields`, `PATCH /api/contact-fields/[id]`, `DELETE /api/contact-fields/[id]`, `POST /api/contacts` (custom value writes), `PATCH /api/contacts/[id]` (custom value updates), `POST /api/contacts/import-csv` (custom field creation + value writes), and the scheduler's contact fetch (already scoped by `user_id` via the campaign).

**Why:** without this, User A can `PATCH /api/contact-fields/<User B's field ID>` and modify User B's field configuration. The existing `defineRoute({ auth: 'user' })` pattern (used in `app/api/contacts/route.ts:9,38`) already provides `ctx.user.id` — use it in every `where`.

**Test:** cross-user integration tests asserting every endpoint returns 404/403 when the resource belongs to another user.

### 11.11 Transactional field deletion → single prisma.$transaction

**Decision:** Field deletion must be a single `prisma.$transaction` containing: (1) ownership verification, (2) `contactFieldValue.deleteMany`, (3) `contactField.delete`. NOT independent operations.

**Why:** the count-then-delete sequence (`count → deleteMany → delete`) as independent operations risks partial deletion if step 2 succeeds but step 3 fails — the field definition remains but all values are gone, leaving an orphaned field and confused templates. A transaction makes it atomic. The same discipline already applies to contact creation/import in the plan; apply it to field mutations too.

### 11.12 Explicit type-coercion rules → no JS loose coercion

**Decision:** When `field_type` is changed on a field with existing values, coercion must use explicit, testable rules — NOT `Number()`, `Boolean()`, or `Date()` loose coercion, because values are user-controlled and loose coercion silently accepts garbage (`Number("abc")` is `NaN`, `Boolean("false")` is `true`).

**Rules (in Phase 3):**
- `text → number`: regex `/^-?\d+(\.\d+)?$/`; `""` → null; else reject.
- `text → date`: `z.string().datetime()` or `Date.parse()` with NaN check; else reject.
- `text → boolean`: allowlist `["true", "false", "1", "0"]` (case-insensitive); else reject.
- `number → text`, `date → text`, `boolean → text`: always allowed (toString).
- If ANY existing value fails, reject the type change with a clear error listing up to ~5 offending values.

**Why:** user-controlled values + loose JS coercion = silent data corruption. Explicit rules are testable and fail loudly.

### 11.13 Email/HTML injection safety → no recursive resolution, test HTML values

**Decision:** The substitution engine must NOT recursively resolve `{{token}}` inside a custom field value. If `contact.size = "{{plan}}"`, the email contains the literal `{{plan}}`, not the plan value. The current engine is non-recursive by design — verify with a test.

**HTML/script values:** if `contact.size = "<script>alert(1)</script>"`, the substituted email body contains the literal string. Whether this is dangerous depends on the downstream MIME generation (`lib/email/mime.ts`) and the email client's rendering. At minimum:
- Add a test asserting the substitution engine does not recursively resolve.
- Add a test asserting HTML/script values are passed through as literal strings (not executed).
- Document the engine's behavior in `lib/email/template.ts` header comments.
- If the email body is ever rendered as HTML in a preview UI, that preview must escape custom field values. (Out of scope for Path C if no HTML preview exists — but flag it.)

**Why:** custom field values are user-controlled and enter outgoing emails. A value like `{{unsubscribe}}` or `<script>` could break email rendering or, in a web preview, execute JS. Non-recursive substitution + literal passthrough + explicit tests close this gap.

### 11.14 Resource limits → cap fields, CSV columns, rows, name/value length

**Decision:** Enforce the following limits (exact values configurable, suggested defaults shown):

| Limit | Default | Enforced where |
|---|---|---|
| `MAX_CUSTOM_FIELDS_PER_USER` | 100 | `POST /api/contact-fields`, CSV "Create & Import" |
| `MAX_CSV_COLUMNS` | 100 | `POST /api/contacts/import-csv` (before processing) |
| `MAX_CSV_ROWS` | 50,000 | `POST /api/contacts/import-csv` (before processing) |
| `MAX_FIELD_NAME_LENGTH` | 50 chars | `POST /api/contact-fields` (already in schema: `VarChar(50)`) |
| `MAX_FIELD_LABEL_LENGTH` | 100 chars | `POST /api/contact-fields` (already in schema: `VarChar(100)`) |
| `MAX_FIELD_VALUE_LENGTH` | 10,000 chars | `POST /api/contacts`, `PATCH /api/contacts/[id]`, CSV import |

**Why:** without limits, a malicious or accidentally huge CSV (10,000 columns, 1M rows, 1MB values) can cause excessive database work, OOM, or denial of service. Limits are checked before processing begins, not mid-import. Return a clear error naming the limit that was hit.

---

## 12. Sign-off

- [x] User has reviewed §1 (current system status) and confirmed accuracy.
- [x] User has approved §3 (hybrid architecture decision).
- [x] User has answered §11 (open questions → resolved decisions, §11.1–§11.14).
- [x] User has approved scope (Path C in, Path B out per §10).
- [x] Review 1 incorporated (CSV prompt, reserved tokens, delete counts, 3-query pattern).
- [x] Review 2 incorporated (authorization, transactional delete, coercion rules, email safety, resource limits, central reserved-token function, security + concurrency tests).
- [ ] User has authorized Phase 1 to begin.

**Next action:** Awaiting user authorization to start Phase 1 (schema + migration). No code will be written until then.
