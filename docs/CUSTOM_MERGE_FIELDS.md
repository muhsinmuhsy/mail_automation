# Custom merge fields — implementation plan (Path C)

> **Status:** IMPLEMENTED. All 7 phases complete. Built-in fields were subsequently simplified (2026-09-09): `company`, `job_title`, `notes` removed; `name` made optional. Only `name` (optional) and `email` (required) remain as built-in columns. This document has been updated to reflect the simplified field set.
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

### Review 3 outcome (2026-09-07) — UX + correctness pass

Third review flagged seven areas. All seven were **accepted** after verification (point 7 verified by running tests + build — all pass):

1. **Field setup UX for nontechnical users** — auto-generate token from label, move up/down instead of sort-order number, merge-tag picker in subject AND body. See §11.15.
2. **Missing-personalization pre-send warning** — before scheduling, warn "N contacts are missing Size." Let user exclude/continue/cancel. See §11.16.
3. **Snapshot-at-scheduling-time behavior** — values are substituted when jobs are created, not when sent. Editing a contact after scheduling doesn't update already-scheduled emails. Must be documented. See §11.17.
4. **Contradictory validation rules** — fix 200 vs 10,000 char conflict; date-only not datetime; distinguish blank vs missing; preserve `0` and `false`; define required-on-PATCH. See §11.18.
5. **Approved-token boundary** — `buildTemplateContact` must expose ONLY approved tokens, not the raw Prisma contact object (which has `id`, `user_id`, `created_at`). Deletion usage check must use the same regex as the engine, not substring match. See §11.19.
6. **Large-import + concurrency** — add CSV file-size limit + batch processing (don't hold one transaction for 5M inserts); concrete concurrency strategy for type changes. See §11.20.
7. **Verification section update** — campaign tests now pass (39/39, verified 2026-09-07); `next build` now succeeds. Remove the stale exceptions. See §11.21.

### Review 4 outcome (2026-09-07) — correctness hardening

Fourth review flagged five remaining correctness gaps plus documentation inconsistencies. All **accepted**:

1. **Date validation contradiction** — §11.18 says date-only but Phase 3/§11.12 still reference datetime; regex accepts impossible dates like `2026-02-31`. Fix: use calendar-validating check everywhere. See §11.22.
2. **CSV partial-failure policy** — batching commits independent transactions; need to define what happens if batch 3 fails after 1-2 succeed, plus retry-without-duplicates. See §11.23.
3. **Concurrency strategy incomplete** — re-reading in a transaction doesn't prevent concurrent changes; need version-based optimistic concurrency; deleted-field update must return conflict, not silent no-op. See §11.24.
4. **Missing-value API contract** — define how Exclude/Continue are submitted, rechecked, and handle zero-recipient edge case. See §11.25.
5. **Prototype-pollution safeguard** — `{{constructor}}`, `{{__proto__}}` could resolve inherited properties. Use `Object.create(null)` + `hasOwnProperty` check. See §11.26.

Plus doc fixes: §6 user journey updated to label-first; "send time" references corrected to "scheduling time."

### Review 5 outcome (2026-09-07) — final correctness hardening

Fifth review flagged three remaining correctness gaps plus five consistency fixes. All **accepted**:

1. **CSV retry not duplicate-free** — `findFirst` + `create` has a TOCTOU race; two concurrent retries can both find nothing and create duplicates. Fix: import session ID for idempotent retry (no unique constraint, no dedup, no overwrite). See §11.27.
2. **Field versions must protect contact-value writes** — a contact update could save a value validated against an old field type while a concurrent request changes the type. Contact writes must re-validate inside the transaction. See §11.28.
3. **Exclude vs Continue indistinguishable** — both send `acknowledgeMissingValues: true`; server can't tell them apart. Add `missingValueAction: "exclude" | "continue"`. See §11.29.

Consistency fixes: Phase 1 adds `version` column; §11.12 date coercion fixed; Phase 4 old no-op wording replaced; §6 token made consistent (`t_shirt_size` throughout); DELETE checks version but doesn't increment (row is gone).

---

## 1. Current system and its status

### 1.1 What exists today

The contacts ↔ templates ↔ send-time substitution pipeline is already wired end-to-end. The plumbing is sound; only the field set is fixed.

**Data model** — `prisma/schema.prisma:132`
```
model Contact {
  id         String   @id @default(...)
  user_id    String   @db.Uuid
  name       String?  @db.VarChar(100)   // optional
  email      String   @db.VarChar(255)
  ...
}
```
Two built-in fields (`name` optional, `email` required). No user-extensible field mechanism.

**Validation** — `lib/validation/contact.ts`
- `createContactSchema` and `updateContactSchema` are static Zod objects. They accept `name` (optional) and `email` only. No dynamic field support.

**Substitution engine** — `lib/email/template.ts`
- `SUPPORTED_TEMPLATE_VARIABLES = ['name', 'email', 'first_name']` (line 27) — hardcoded const.
- `replaceTemplateVariables(text, contact)` (line 49) — pure function, regex-based, resolves `{{token}}` against the contact object. Idempotent. Missing values are left as the literal `{{token}}` (no fallback syntax).
- `first_name` is derived from `name` (split on whitespace).

**Send-time wiring** — `lib/jobs/scheduler.ts:46-47`
```ts
subject: replaceTemplateVariables(template.subject, contact),
body:    replaceTemplateVariables(template.body, contact),
```
The scheduler already calls the substitution function per-recipient at job-generation time. This is the single integration point — extending it does not require new plumbing.

**Contacts UI**
- `app/(dashboard)/contacts/page.tsx` — list page with search, pagination, add/import toggles. `Contact` type on line 22 includes `name?: string`.
- `components/contacts/ContactForm.tsx:26-28` — renders `Name` (optional), `Email` (required).
- `components/contacts/ContactCard.tsx` — renders **only** name and email.
- `components/contacts/ContactImport.tsx:18` — helper text says CSV "should contain name and email columns".

**Contacts API** — `app/api/contacts/route.ts`
- GET (line 27): `select: { id, name, email }` — explicitly selects a fixed set.
- POST (line 52-61): writes `name, email` from the parsed body.
- Search (line 16-21): `OR: [name contains, email contains]` — only name and email are searchable.

**Templates UI**
- `app/(dashboard)/templates/page.tsx` — list page. `Template` type on line 19 is `{ id, name, subject, created_at }` — note: `body` is not even in the page-level type.
- `components/templates/TemplateForm.tsx:27-29` — three inputs: Template name, Subject, Body (plain `<Textarea>`). **No merge-tag picker** — authors must memorize `{{name}}`, `{{email}}`, etc.

**Tests**
- `tests/unit/email/template.test.ts` — covers `{{name}}`, `{{email}}`, `{{first_name}}`, whitespace-tolerant `{{ NAME }}`, unknown-token passthrough, and idempotency.
- `tests/integration/api/contacts-crud.test.ts`, `tests/integration/api/contacts-import-csv.test.ts` — CRUD + CSV import coverage.

### 1.2 Status summary

| Capability | Status |
|---|---|
| Fixed set of 2 contact fields (name optional, email required) | ✅ Working |
| `{{token}}` substitution at scheduling time | ✅ Working |
| Per-recipient personalization in campaigns | ✅ Working |
| User-defined custom fields | ❌ Not supported |
| Merge-tag picker in template editor | ❌ Not supported |
| Fallback values (`{{x:default}}`) | ❌ Not supported |
| Conditional blocks (`{{#if x}}`) | ❌ Not supported |
| Segmentation by custom fields | ❌ Not supported (search is name + email only) |
| Onboarding / audience-field setup wizard | ❌ Does not exist |

### 1.3 Pre-existing test status (verified 2026-09-07)

- `npx vitest run tests/unit/components/campaigns` — **39/39 pass** (all CampaignDetails, CampaignWizard, CampaignsPage, CampaignForm, CampaignCard, CampaignList, SchedulePreview).
- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npm run build` — **succeeds** (full route map generated).
- All four gates pass on the unmodified codebase as of 2026-09-07. Previous notes about pre-existing campaign failures and build sandbox issues were stale and have been removed.

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

Keep the two existing columns (`name`, `email`) on `Contact` exactly as-is. Add a new side table for **user-defined custom fields only**.

- **Pros:** Zero disruption to existing code. `ContactForm`, `ContactCard`, `replaceTemplateVariables`, the scheduler, and all Prisma-generated references to `contact.name` / `contact.email` keep working untouched. Custom fields are purely additive — you only pay for what users actually extend.
- **Cons:** Two code paths for "built-in field" vs "custom field" in a few places (the merged-contact builder, the merge-tag picker list).

### 3.2 Full migration (rejected)

Move every field (including `name` and `email`) into `ContactField` + `ContactFieldValue` rows. More "pure" but rips through every file that references `contact.name`, `contact.email`, etc. Higher risk, larger blast radius, no user-facing benefit over hybrid.

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
    - `version Int @default(0)` — optimistic concurrency control. Incremented on every PATCH. Checked (not incremented) on DELETE. See §11.24.
    - `created_at`, `updated_at` timestamps.
  - `ContactFieldValue`:
    - `id String @id @default(...) @db.Uuid`
    - `contact_id String @db.Uuid` + relation to `Contact` (onDelete: Cascade)
    - `field_id String @db.Uuid` + relation to `ContactField` (onDelete: Cascade)
    - `value String?` — stored as text; interpretation depends on `field_type`. Nullable for optional fields.
    - `created_at`, `updated_at` timestamps.
    - Unique on `(contact_id, field_id)`.
- Add `contact_fields ContactField[]` and `contact_field_values ContactFieldValue[]` relations to `Contact` and `User`.
- Add `import_session_id String? @db.Uuid` to `Contact` (nullable, set only during CSV imports; used for idempotent retry — see §11.27). Existing contacts have `null`; no backfill needed.
- New Prisma migration under `prisma/migrations/` following the existing `YYYYMMDD_description` naming convention.

**Seed:** None. The side table starts empty. Built-in fields stay as columns; users add custom fields via the UI.

**Verification gate:**
- `npx prisma migrate dev --name add_custom_contact_fields` succeeds.
- `npx prisma generate` regenerates the client without error.
- Existing test suite still passes (no behavioral change yet).

---

### Phase 2 — Substitution engine

**Files:**
- `lib/email/template.ts` — keep `SUPPORTED_TEMPLATE_VARIABLES` and `replaceTemplateVariables` unchanged in signature. The built-ins (`name`, `email`, `first_name`) continue to resolve from the contact object.
- New `lib/email/template-contact.ts` — `buildTemplateContact(contact, fieldValues, userFieldDefinitions): TemplateContact`:
  - Flattens built-in fields (`name`, `email`) from the contact.
  - Flattens custom field values into top-level keys by their `name` token (e.g. `{ size: "M", plan: "Pro" }`).
  - **Returns a flat map containing ONLY approved tokens** (built-ins + the user's defined custom field names) — NOT the raw Prisma contact object. This prevents `{{id}}`, `{{user_id}}`, `{{created_at}}`, `{{updated_at}}` from resolving. See §11.19.
  - **Prototype-pollution safeguard (see §11.26):** the returned map must be created with `Object.create(null)` (no prototype chain), so `{{constructor}}`, `{{__proto__}}`, `{{toString}}`, `{{valueOf}}` resolve to undefined and are left as literal tokens. Additionally, `replaceTemplateVariables` must use `Object.prototype.hasOwnProperty.call(contact, varName)` before accessing the value — defense in depth.
  - The `userFieldDefinitions` parameter is the list of the user's `ContactField` names — only tokens in this list + the built-in list are included in the returned object.

**Why this shape:** keeps `replaceTemplateVariables` pure and unchanged. The merge logic lives in one testable helper. The scheduler call site changes minimally.

**Tests:** extend `tests/unit/email/template.test.ts` with cases for custom tokens (`{{size}}`, `{{plan}}`) and add a new test file for `buildTemplateContact`.

**Email/HTML injection safety tests (mandatory — see §11.13):** custom field values enter outgoing emails. Add explicit test cases:
- Token variants: `{{size}}`, `{{ size }}`, `{{SIZE}}` (case-insensitivity), `{{unknown}}` (passthrough), `{{name}}{{size}}` (adjacent tokens).
- **Prototype pollution (see §11.26):** `{{constructor}}`, `{{__proto__}}`, `{{toString}}`, `{{valueOf}}` — all must return the literal token, NOT the inherited property. Test explicitly.
- Value containing a token: `contact.size = "{{plan}}"` — must NOT recursively resolve; the literal `{{plan}}` goes into the email, not the plan value. (Current engine is non-recursive by design — verify with a test.)
- Value containing HTML/script: `contact.size = "<script>alert(1)</script>"` — the substituted email body contains the literal string; it must NOT become executable HTML/JS. The correct mitigation depends on how the email body is rendered/sanitized downstream (MIME generation in `lib/email/mime.ts`). At minimum, document the substitution engine's behavior and add a test asserting no recursive resolution.

**Verification gate:** `npx tsc --noEmit` clean; `npm test -- template` green.

---

### Phase 3 — Dynamic validation

**Files:**
- `lib/validation/contact.ts` — convert `createContactSchema` and `updateContactSchema` from static consts to builder functions:
  - `buildCreateContactSchema(customFields: ContactField[]): z.ZodObject`
  - `buildUpdateContactSchema(customFields: ContactField[]): z.ZodObject`
  - Base schema stays the same (`name` optional, `email` required).
  - For each custom field, add a key typed by `field_type`:
    - `text` → `z.string().max(MAX_FIELD_VALUE_LENGTH).optional()` (or `.nonempty()` if `is_required`). **Note:** custom field values use `MAX_FIELD_VALUE_LENGTH` (10,000 chars per §11.14).
    - `number` → `z.coerce.number().optional()` (or required). **`0` is a legitimate value**, not "missing" — do not use `.nonempty()` or truthiness checks.
    - `date` → `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((val) => { const d = new Date(val + 'T00:00:00Z'); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === val; }, 'Invalid calendar date').optional()` (date-only, YYYY-MM-DD, rejects impossible dates like `2026-02-31`). NOT datetime. See §11.22.
    - `boolean` → `z.boolean().optional()`. **`false` is a legitimate value**, not "missing" — do not use truthiness checks.
  - **PATCH semantics (see §11.18):** distinguish "field not provided" (omit key → no change) from "field cleared" (key present, value null/empty → set to null). Required-ness is only validated for keys present in the payload; a PATCH that omits a required field does not trigger validation. A PATCH that explicitly sets a required field to null/empty is rejected.
- Keep `importCsvSchema` as-is for now; CSV mapping changes in Phase 5.
- Preserve `CreateContactInput` / `UpdateContactInput` type exports — they become the base inputs; a separate `CustomFieldValues` type covers the dynamic part.

**Explicit type-coercion rules (mandatory — see §11.12):** when `field_type` is changed on an existing field, coercion must use explicit, testable rules — NOT JS loose coercion (`Number()`, `Boolean()`) because values are user-controlled:
- `text → number`: `"123"` ✅, `"12.5"` ✅, `""` ✅ (→ null), `"abc"` ❌ reject. Use `z.coerce.number()` or a regex `/^-?\d+(\.\d+)?$/`.
- `text → date`: `"2026-09-07"` ✅, `"2026-02-31"` ❌ reject (impossible calendar date), `"2026-09-07T10:00:00Z"` ❌ reject (not date-only), `"hello"` ❌ reject. Use the same calendar-validating check as Phase 3: regex `/^\d{4}-\d{2}-\d{2}$/` + round-trip `new Date(val + 'T00:00:00Z')` check. See §11.22.
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
    - `template_usage_count` — number of templates whose `subject` or `body` contains the token, matched using the **same `VARIABLE_PATTERN` regex** as the substitution engine (`/\{\{\s*(\w+)\s*\}\}/g` with case-insensitive comparison), NOT a naive substring match. This ensures `{{size}}`, `{{ size }}`, and `{{SIZE}}` are all recognized consistently. See §11.19.
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
  - Map CSV columns by header name. Built-in headers (`name`, `email`) map to columns. Any other header maps to a custom field by `name` token if one exists.
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
  - **File-size limit + batch processing (see §11.20):** reject the upload if the file exceeds `MAX_CSV_FILE_SIZE` (e.g. 10MB) before parsing. For large imports, process in **batches of ~1,000 rows** with a `createMany` per batch, NOT one giant transaction for all rows. Hold a transaction only for the field-definition creation (if "Create & Import") + the first batch; subsequent batches are independent `createMany` calls. This avoids holding a long-running transaction for 5M+ inserts. Report progress to the client if the import exceeds a threshold (e.g. >5,000 rows).
  - **Concurrency strategy (see §11.20, §11.24):** version-based optimistic locking on `ContactField` — every PATCH/DELETE includes `version: expectedVersion` in the `where` clause; mismatch → 409 Conflict. For simultaneous same-token creation, the DB unique constraint on `(user_id, name)` produces P2002 — handle as a clean 409 Conflict. For delete-during-contact-update, the contact-value write checks the field still exists; if deleted, return 409 Conflict "Field was deleted" — NOT a silent no-op. Contact-value writes re-validate against the field's current type inside the transaction (see §11.28).

**Verification gate:** existing `tests/integration/api/contacts-crud.test.ts` and `contacts-import-csv.test.ts` still pass unchanged (backward compat). New integration tests for the `contact-fields` routes (create, list, update, delete, token-collision rejection, type-change rejection). **Security tests (mandatory — see §9):** cross-user authorization tests (User A cannot read/update/delete User B's fields or write values into them). **Concurrency tests:** simultaneous creation of the same token (expect clean P2002 conflict handling), simultaneous update of the same field, delete while a contact update is in flight.

---

### Phase 5 — UI

**UI audit (mandatory before implementation):** match existing patterns — `Input`, `Textarea`, `Button`, `Pagination`, `EmptyState`, `LoadingSpinner`, `ConfirmDialog`, the card grid layout in `contacts/page.tsx`, the form-in-bordered-card pattern. Do not introduce divergent components.

**New page:** `app/(dashboard)/settings/fields/page.tsx`
- Lists the user's `ContactField` definitions in a card grid or table (match existing list-page pattern).
- "Add field" button toggles an inline form (match the `showAddContact` pattern in `contacts/page.tsx`).
- **Field form UX (see §11.15):**
  - Primary input is **"Field label"** (e.g. "T-shirt size"). The token is **auto-generated** from the label (`t_shirt_size`) and shown as read-only below. An "Edit token" toggle reveals an advanced input for users who want to override. This makes field creation accessible to nontechnical users.
  - **Move up / move down buttons** replace the sort-order number input. Users don't think in ordinal numbers. The API receives the new position via a reorder endpoint or via `sort_order` computed from the new list position.
- Per-field actions: edit label, move up, move down, toggle required, delete (via `ConfirmDialog` showing template-usage count + contact-value count + affected template names per Phase 4 `DELETE`).
- Built-in fields (name, email) shown as locked/non-editable rows for clarity.

**Modified components:**
- `components/contacts/ContactForm.tsx`
  - Accept a `fields: ContactField[]` prop.
  - After the 2 built-in inputs, render one `Input` per custom field, ordered by `sort_order`. Required-ness from `field.is_required`. Input type from `field.field_type` (text → `Input`, number → `Input type="number"`, date → `Input type="date"`, boolean → a checkbox/toggle — match existing pattern if one exists, else use `Input`).
  - Submit body includes custom field values keyed by token name.
- `components/contacts/ContactCard.tsx`
  - After name + email, render a small "fields" section showing custom field label/value pairs for non-empty values. Keep the card visually consistent with the existing layout.
- `components/contacts/ContactImport.tsx`
  - Update helper text on line 18: "CSV should contain name, email, and any custom field columns by their token name (e.g. `size`, `plan`). Unknown columns will prompt you to create them as fields before importing."
  - On import, if the API returns unknown columns, show a confirmation dialog listing them with "Create & Import" / "Cancel" actions (match existing `ConfirmDialog` pattern).
- `components/templates/TemplateForm.tsx`
  - Add a merge-tag picker (small dropdown or popover button) above **both** the `Subject` input AND the `Body` textarea. Merge tags are used in subject lines too (the scheduler substitutes both `template.subject` and `template.body` at `scheduler.ts:46-47`). See §11.15.
  - Lists built-in tokens (`{{name}}`, `{{email}}`, `{{first_name}}`) + the user's custom field tokens (`{{size}}`, `{{plan}}`, …).
  - Each entry shows **label + token**, e.g. "Size ({{size}})" — helps authors who know the field by its display label. Built-ins show their natural name, e.g. "Name ({{name}})".
  - Clicking a token inserts it at the cursor position in the textarea.
  - Fetch the user's fields via `GET /api/contact-fields` on mount.
  - Match existing `Button` + `Input` styling for the picker trigger.

**Verification gate:** `npx tsc --noEmit` clean; `npx eslint .` clean. New component tests under `tests/unit/components/contacts/` (dynamic form rendering, required validation, card field display) and `tests/unit/components/templates/` (picker renders correct tokens, inserts at cursor). UI audit sign-off: new components match existing patterns.

---

### Phase 6 — Scheduler (scheduling-time wiring)

**Files:**
- `lib/jobs/scheduler.ts`
  - Line 21-23: change `prisma.contact.findMany` to `include: { contact_field_values: { include: { field: true } } } }`.
  - Before calling `replaceTemplateVariables` on lines 46-47, call `buildTemplateContact(contact, contact.contact_field_values, userFieldDefinitions)` from Phase 2.
  - The substitution call sites stay otherwise identical:
    ```ts
    const templateContact = buildTemplateContact(contact, contact.contact_field_values, userFieldDefinitions);
    subject: replaceTemplateVariables(template.subject, templateContact),
    body:    replaceTemplateVariables(template.body, templateContact),
    ```

**Snapshot-at-scheduling-time behavior (must document — see §11.17):** substitution happens in `generateCampaignJobs`, which creates `EmailJob` rows with the **already-substituted** `subject` and `body` (final text, not template + contact references). This means:
- Editing a contact **after** jobs are generated but **before** they are sent does NOT update the scheduled email — the job already contains the snapshot of the values at generation time.
- Editing a template after jobs are generated has the same non-effect.
- This is intentional (it prevents last-minute contact edits from changing emails mid-send) but must be documented in the UI (e.g., a note on the campaign schedule step: "Personalization values are captured when the campaign is scheduled. Editing contacts afterward will not affect already-scheduled emails.") and in the plan.

**Verification gate:** new unit test for `generateCampaignJobs` with a contact that has custom field values, asserting the scheduled `subject` and `body` contain the substituted custom values.

---

### Phase 7 — Final verification

- `npx tsc --noEmit` — typecheck clean.
- `npx eslint .` — lint clean.
- `npm test` — all tests green (full suite passes as of 2026-09-07).
- `npm run build` — production build succeeds.
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
   - Field label: `T-shirt size` — the primary input. Token `t_shirt_size` is auto-generated below (read-only, with an "Edit token" toggle for advanced users).
   - Field type: `text` (or `number`, `date`, `boolean`).
   - Required: No.
   - Position: determined by move up / move down buttons (not a numeric sort order).
3. Saves. POST to `/api/contact-fields` creates one `ContactField` row.
4. **Automatically, with no further user action:**
    - `/contacts` "Add contact" form now shows a "T-shirt size" input below Email.
   - `/contacts` contact cards show "T-shirt size: M" for contacts that have a value.
   - `/contacts` CSV import accepts a `t_shirt_size` column header and maps it.
   - `/templates` merge-tag picker lists `{{t_shirt_size}}` alongside the built-ins.
   - `POST /api/contacts` validation accepts a `t_shirt_size` key in the body.
   - At campaign scheduling time, `{{t_shirt_size}}` in any template is replaced per-recipient. (Note: substitution happens at job-creation time, not at send time — see §11.17.)
5. User adds a contact with `t_shirt_size = "M"`.
6. User writes a template `Available in size {{t_shirt_size}}`.
7. User sends a campaign; the email goes out as "Available in size M".

**Later, the user can:** rename the label ("T-shirt size" → "Shirt Size"), reorder it, make it required (only enforced on new/updated contacts), change type (only if existing values are coercible), or delete it (cascades to all values; templates containing `{{t_shirt_size}}` will then leave the literal `{{t_shirt_size}}` in sent emails).

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
2. **Token collision + reserved tokens** — the `contact-fields` POST route must reject names matching built-ins (`name`, `email`, `first_name`) **and** reserved system tokens (`id`, `user_id`, `contact_id`, `unsubscribe`, `unsubscribe_url`, `campaign`, `date`, and any token starting with `_`). The reserved list protects future system merge tags (notably `unsubscribe`/`unsubscribe_url` for CAN-SPAM compliance) and database column names. Enforce server-side; the full reserved list is in §11.2.
3. **Token immutability** — `name` (the token) must be immutable after creation because templates reference it. Only `label` is mutable.
4. **CSV import backward compat** — existing CSVs with `name,email` columns must still import cleanly. Do not break the happy path while adding custom-column mapping. Unknown columns trigger an explicit "Create & Import" prompt, not silent auto-creation.
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
- `npx tsc --noEmit` — typecheck clean.
- `npx eslint .` — lint clean.
- `npm test` — all tests green. As of 2026-09-07, the full suite passes (including campaign tests). Any failure is a regression and blocks.
- `npm run build` — production build succeeds. As of 2026-09-07, this passes. Any failure blocks.
- New code must have corresponding tests. Modified code must have updated tests.
- UI changes must pass the UI-consistency audit (§8, item 8).
- **Security tests (mandatory for Phase 4):** integration tests asserting cross-user isolation — User A cannot GET/PATCH/DELETE User B's `ContactField`, cannot write `ContactFieldValue` into User B's field, and cannot import into User B's field definitions. These follow the existing integration-test pattern in `tests/integration/api/`.
- **Concurrency tests (mandatory for Phase 4):** simultaneous same-token creation (expect clean P2002 conflict error, not a crash), simultaneous same-field update, delete-while-contact-update-in-flight. The DB uniqueness constraint on `(user_id, name)` protects the first; the API must handle the resulting Prisma error gracefully.

---

## 10. Out of scope (future enhancements — Path B)

These Mailchimp features are intentionally excluded from Path C to keep scope bounded:
- **Fallback values** (`{{size:default}}`) — Easy, ~10 lines in `lib/email/template.ts`.
- **Conditional blocks** (`{{#if size}}…{{/if}}`) — Medium, requires a small parser.
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

- **Built-in field names:** `name`, `email`, `first_name`
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

**Decision:** Each entry in the picker shows the display label followed by the token in parentheses, e.g. "Size ({{size}})", "Name ({{name}})".

**Why:** authors think in labels ("I want to insert the Size"), but need the token to recognize it in the template body. Showing both bridges the gap without forcing the author to memorize tokens.

### 11.7 ContactCard display → custom fields only this scope

**Decision:** In this scope, `ContactCard` shows custom field label/value pairs only. The built-ins (`name`, `email`) are already displayed.

**Why:** keeps the scope of this change bounded to the custom-fields feature.

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
- `text → date`: regex `/^\d{4}-\d{2}-\d{2}$/` + round-trip `new Date(val + 'T00:00:00Z')` check (rejects `2026-02-31` and datetime strings); else reject. See §11.22.
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

### 11.15 Field setup UX for nontechnical users → auto-token, move up/down, picker in subject + body

**Decision:**
- **Auto-generate token from label:** the "Add field" form's primary input is "Field label" (e.g. "T-shirt size"). The token (`t_shirt_size`) is auto-generated by lowercasing, replacing spaces/non-alphanumeric with underscores, and truncating to 50 chars. Shown as read-only with an "Edit token" toggle for advanced users. If the generated token collides with a reserved token or an existing field, append `_2`, `_3`, etc.
- **Move up / move down buttons** replace the sort-order number input. The API receives the new position; `sort_order` is recomputed from the list position.
- **Merge-tag picker in subject AND body:** the picker appears above both the Subject input and the Body textarea in `TemplateForm.tsx`. The scheduler substitutes both `template.subject` and `template.body` (`scheduler.ts:46-47`), so authors need token insertion in both places.

**Why:** nontechnical users think in labels, not tokens. Forcing them to invent a lowercase-alphanumeric token is friction. Sort-order numbers are developer UX, not user UX. Subject-line personalization is common ("Hi {{first_name}}, your {{plan}} plan…") and the picker must support it.

### 11.16 Missing-personalization pre-send warning → warn at scheduling time

**Decision:** When a user schedules a campaign, before generating jobs, scan the selected contacts for missing values in fields the template references. If any contacts are missing values:
  - Show a warning: "N contacts are missing values for: Size, Plan. Emails to these contacts will contain the literal `{{size}}`, `{{plan}}` in the body."
  - Offer three actions: **[Exclude affected contacts]**, **[Continue anyway]**, **[Cancel]**.
  - The chosen action is submitted as `missingValueAction: "exclude" | "continue"` (see §11.29). The server enforces each differently. `acknowledgeMissingValues: true` is NOT used — the explicit enum replaces it.

**Why:** sending "Hello {{size}}" looks broken to the recipient and damages sender reputation. This is a pre-send check, not fallback syntax — it doesn't require Path B's `{{x:default}}`. It surfaces the problem at the right moment (when the user can still act) without blocking the feature.

**Implementation note:** this check runs in the campaign scheduling API, not in the scheduler. It scans the template for `{{token}}` patterns, maps them to custom fields, queries the selected contacts for missing values, and returns the counts. The UI shows the warning before the user confirms scheduling. Since `name` is optional and `email` is always required, only custom field missing values are detected — no built-in field can be "missing."

**API contract (see §11.25):**
- **Pre-check:** `POST /api/campaigns/[id]/pre-check` with `{ templateId, contactIds }` returns:
  ```json
  {
    "missingValues": [
      { "token": "size", "label": "Size", "contactCount": 12, "contactIds": ["..."] },
      { "token": "plan", "label": "Plan", "contactCount": 3, "contactIds": ["..."] }
    ],
    "unknownTokens": ["{{deleted_field}}"],
    "affectedContactCount": 15,
    "totalContactCount": 100
  }
  ```
  Scans **both** `template.subject` and `template.body` for tokens. Reports **unknown/deleted** tokens (template references a field that no longer exists). Built-in fields (`name`, `email`) are never reported as missing — `name` is optional and `email` is always required.
- **Submit — Exclude:** `POST /api/campaigns/[id]/schedule` with `{ contactIds: [...filtered], missingValueAction: "exclude" }`. Server re-checks; if remaining contacts still have missing values, returns 400. If filtered list is empty, returns 400 "No recipients remaining after excluding contacts with missing values. Cannot create an empty campaign."
- **Submit — Continue:** `POST /api/campaigns/[id]/schedule` with `{ contactIds: [...all], missingValueAction: "continue" }`. Server proceeds; missing values leave literal `{{token}}` in the email.
- **Submit — Cancel:** client does not submit; returns to campaign editor.
- **Recheck:** the scheduling API always re-runs the pre-check. If `missingValueAction` is absent and there are missing values, returns 400 with the pre-check result. This prevents bypassing the check.

### 11.17 Snapshot-at-scheduling-time → document explicitly

**Decision:** Document in the plan and in the campaign UI that personalization values are captured when jobs are generated (`generateCampaignJobs` in `lib/jobs/scheduler.ts`), not when the worker sends them. `EmailJob` rows store the already-substituted `subject` and `body` (final text). Editing a contact or template after scheduling does not affect already-scheduled emails.

**Why:** this is the existing design (the scheduler at lines 46-47 already substitutes at job-creation time), and it's intentional — it prevents last-minute edits from changing emails mid-send. But it's non-obvious and must be communicated to users so they don't expect editing a contact to update a scheduled email. Add a note on the campaign schedule step: "Personalization values are captured when the campaign is scheduled."

### 11.18 Validation rule consistency → fix contradictions

**Decision:**
- **Value length:** custom field values use `MAX_FIELD_VALUE_LENGTH` (10,000 chars, per §11.14). `ContactFieldValue.value` should be `@db.Text` (PostgreSQL `text`, effectively unbounded at the DB level) with the 10,000-char limit enforced in validation.
- **Date fields:** `field_type: date` validates as date-only `YYYY-MM-DD` with **calendar-validity check** (rejects `2026-02-31`), NOT ISO 8601 datetime with time. Store as string. Use `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine()` with a `new Date(val + 'T00:00:00Z')` round-trip check. See §11.22. If datetime is needed later, add a separate `datetime` field type.
- **Blank vs missing (PATCH semantics):** a key absent from the PATCH payload means "no change." A key present with `null` or empty string means "clear the value" (set to null). These are distinct operations.
- **`0` and `false` are legitimate values:** for `number` fields, `0` is a valid value, not "missing." For `boolean` fields, `false` is a valid value, not "missing." Validation must not use truthiness checks or `.nonempty()` for these types.
- **Required on PATCH:** required-ness is only validated for keys present in the payload. A PATCH that omits a required field does not trigger validation (partial update). A PATCH that explicitly sets a required field to null/empty is rejected.

**Why:** the previous plan had contradictory limits (200 vs 10,000), mixed date and datetime, and didn't distinguish blank from missing. These are correctness issues, not just polish.

### 11.19 Approved-token boundary → expose only approved tokens, consistent usage check

**Decision:**
- `buildTemplateContact` must return a **flat map of only approved tokens** (the 2 built-ins + the user's defined custom field names), NOT the raw Prisma `Contact` object. The raw object has `id`, `user_id`, `created_at`, `updated_at`, and relation fields — none of these should be resolvable via `{{id}}` etc. This is a security boundary, not just a convenience.
- The deletion usage check (`template_usage_count` in Phase 4 `DELETE`) must use the **same `VARIABLE_PATTERN` regex** as the substitution engine (`/\{\{\s*(\w+)\s*\}\}/g` with case-insensitive token comparison), NOT a naive substring match. This ensures `{{size}}`, `{{ size }}`, and `{{SIZE}}` are all recognized as usage of the `size` field.

**Why:** the current `replaceTemplateVariables` reads `contact[varName]` for any `varName` — if the contact object exposes `user_id`, then `{{user_id}}` resolves to it. Reserving names at field-creation time is insufficient; the rendering boundary must also be enforced. Inconsistent usage detection (substring vs regex) would either over-count or under-count affected templates on delete.

### 11.20 Large-import + concurrency → file-size limit, batch processing, optimistic concurrency

**Decision:**
- **CSV file-size limit:** reject uploads exceeding `MAX_CSV_FILE_SIZE` (default 10MB) before parsing.
- **Batch processing:** for imports exceeding ~1,000 rows, process in batches of ~1,000. Each batch is a transaction containing the contact + its custom field values together (atomic per batch). This avoids holding a long-running transaction for 5M+ inserts. Report progress to the client for imports >5,000 rows.
- **Partial-failure policy (see §11.23):** if batch N fails after batches 1..N-1 succeed, the successful batches remain committed. Return a structured response: `{ imported: N, failed: M, failedRows: [{ row: R, email: "...", errors: ["..."] }] }`. The client shows "N imported, M failed" and offers "Retry failed rows" which re-submits only the failed rows. Retry is idempotent via import session ID (see §11.27) — no duplicates, no overwrites, no unique constraint needed.
- **Concurrency — version-based optimistic locking (see §11.24):** `version Int @default(0)` on `ContactField`. PATCH checks + increments version; DELETE checks but does NOT increment (row is gone). Mismatch → 409 Conflict.
- **Concurrency — contact-value writes (see §11.28):** use Serializable transaction isolation with bounded retries (3). On serialization failure (P2034), re-read field types, re-validate values, retry. If validation fails after retry, return 409.
- **Concurrency — same-token creation:** the DB unique constraint on `(user_id, name)` produces P2002. Handle as a clean 409 Conflict with message "A field with this token already exists."

**Why:** 100 fields × 50,000 rows = 5M `ContactFieldValue` rows in one import — too many for a single transaction. Without a file-size limit, a 1GB CSV could OOM the parser. Without batch processing, the transaction would hold locks for minutes. Without version-based concurrency + Serializable isolation, type changes could corrupt values being written concurrently. Without import session ID, retries could create duplicates.

### 11.21 Verification section → remove stale exceptions, require full suite + build

**Decision:** Remove the exceptions for pre-existing campaign test failures and `next build` sandbox failures. As of 2026-09-07 (verified by running all four gates), the full test suite passes (39/39 campaign tests + all others), `tsc` is clean, `eslint` is clean, and `npm run build` succeeds. All four are mandatory gates; any failure is a regression.

**Why:** the pre-existing-failure notes were accurate when written but became stale. Historical exceptions must not become permanent acceptance criteria — they hide real regressions. Re-verify at the start of each phase; if a gate breaks, fix it or investigate before proceeding.

### 11.22 Date validation → calendar-validating, date-only, consistent everywhere

**Decision:** All date validation (Phase 3 field validation, §11.12 coercion rules, §11.18 validation consistency) uses **one** rule: date-only `YYYY-MM-DD` with calendar-validity check. NOT datetime. NOT regex-only (which accepts `2026-02-31`).

**Implementation:** `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((val) => { const d = new Date(val + 'T00:00:00Z'); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === val; }, 'Invalid calendar date')`. The round-trip check rejects impossible dates because `new Date('2026-02-31T00:00:00Z')` rolls over to March 3, and the round-trip doesn't match.

**Why:** the previous plan contradicted itself — §11.18 said date-only but Phase 3/§11.12 still accepted datetime, and the regex-only check accepted `2026-02-31`. One consistent, calendar-validating rule everywhere.

### 11.23 CSV partial-failure policy → per-batch transactions, structured response, idempotent retry

**Decision:**
- Each batch is a transaction containing the contact + its custom field values together (atomic per batch). If batch N fails, batches 1..N-1 remain committed.
- Response: `{ imported: N, failed: M, failedRows: [{ row: R, email: "...", errors: ["..."] }] }`.
- Client shows "N imported, M failed" with a "Retry failed rows" action.
- **Idempotent retry (see §11.27):** retry re-submits only the failed rows with the same `import_session_id` as the original import. The server checks whether a contact with that email was already imported in this session (by `import_session_id`) — if yes, skip; if no, create. This prevents duplicates without requiring a DB unique constraint, without overwriting existing contacts, and without destructive deduplication.

**Why:** without a partial-failure policy, a single bad row in batch 3 of 50 would roll back batches 1-2 (hundreds of successfully imported contacts) — unacceptable UX. Without idempotent retry, retrying would create duplicate contacts. The import session ID approach is safe, non-destructive, and doesn't require schema constraints beyond a nullable column.

### 11.24 Concurrency → version-based optimistic locking on ContactField

**Decision:**
- Add a `version Int @default(0)` column to `ContactField` (Phase 1 schema).
- Every `PATCH /api/contact-fields/[id]` includes the client's last-known version. The server's `where` clause includes `version: expectedVersion`. If the version doesn't match, the update affects 0 rows → return 409 Conflict "This field was modified by another request. Please refresh and retry." On success, increment the version.
- `DELETE /api/contact-fields/[id]` checks the version in the `where` clause (same 409 on mismatch) but does NOT increment — the row is being deleted, so incrementing is unnecessary.
- **Deleted-field update:** when writing `ContactFieldValue`, if the `ContactField` was deleted between read and write, return 409 Conflict "Field '{{token}}' was deleted. Please refresh and retry." — NOT a silent no-op.

**Why:** re-reading values inside a transaction doesn't prevent another request from changing them afterward — the transaction only provides atomicity, not isolation against concurrent writes. Version-based optimistic locking is the standard pattern. A silent no-op on deleted-field update would hide the problem and leave the user thinking their update succeeded.

### 11.25 Missing-value API contract → pre-check endpoint, submit flow, zero-recipient guard

**Decision:** The missing-value check (§11.16) has a concrete API contract:

**Pre-check:** `POST /api/campaigns/[id]/pre-check` with `{ templateId, contactIds }` returns `{ missingValues: [{ token, label, contactCount, contactIds }], unknownTokens: [...], affectedContactCount, totalContactCount }`.
- Scans **both** `template.subject` and `template.body` for tokens using the `VARIABLE_PATTERN` regex.
- Reports **unknown/deleted** tokens separately.
- Built-in fields (`name`, `email`) are never reported as missing — `name` is optional and `email` is always required.

**Submit flow:**
- **Exclude:** `POST /api/campaigns/[id]/schedule` with `{ contactIds: [...filtered], missingValueAction: "exclude" }`. Server re-checks; if remaining contacts still have missing values, returns 400. If filtered list is empty, returns 400 "No recipients remaining after excluding contacts with missing values. Cannot create an empty campaign."
- **Continue:** same endpoint with `{ contactIds: [...all], missingValueAction: "continue" }`. Server proceeds; missing values leave literal `{{token}}`.
- **Cancel:** client does not submit; returns to campaign editor.

**Recheck:** the scheduling API **always** validates ownership, recipients, and template, and **always runs the pre-check** to detect missing values. `missingValueAction` controls the response: `"exclude"` + missing values → 400; `"continue"` + missing values → proceed (explicitly permitted); absent + missing values → 400 (force user to choose). Prevents bypassing the check via direct API call.

**Why:** without a defined API contract, client and server could disagree on what "exclude" means, the zero-recipient edge case could create an empty campaign, and a direct API call could bypass the check.

### 11.26 Prototype-pollution safeguard → Object.create(null) + hasOwnProperty check

**Decision:**
- `buildTemplateContact` returns `Object.create(null)` — a map with no prototype chain. `{{constructor}}`, `{{__proto__}}`, `{{toString}}`, `{{valueOf}}` resolve to `undefined` and are left as literal tokens.
- `replaceTemplateVariables` uses `Object.prototype.hasOwnProperty.call(contact, varName)` before accessing the value — defense in depth.
- **Tests:** explicitly test `{{constructor}}`, `{{__proto__}}`, `{{toString}}`, `{{valueOf}}`, `{{hasOwnProperty}}` — all must return the literal token, NOT the inherited property.

**Why:** a plain `{ size: "M" }` has `obj.constructor === Object` (the constructor function). `{{constructor}}` would produce `"function Object() { [native code] }"` in the email. `Object.create(null)` + `hasOwnProperty` is the standard safeguard. Critical because custom field values are user-controlled and enter outgoing emails.

### 11.27 CSV retry idempotency → import session ID, no unique constraint, no dedup, no overwrite

**Decision:**
- **Add `import_session_id String? @db.Uuid` to `Contact`** (Phase 1, nullable, set only during CSV imports). Existing contacts have `null`; no backfill needed.
- **Each import** gets a unique session ID (UUID). All contacts created during the import are tagged with `import_session_id = sessionId`.
- **Retry** re-submits only the failed rows with the **same** session ID. The session lookup and contact creation must happen **inside the same Serializable transaction** (see §11.28) — `findFirst({ where: { user_id, email, import_session_id: sessionId } })` + `create` in one atomic operation. If found, **skip** (already imported in this session — don't create, don't overwrite). If not found, create with the session ID. On serialization failure (P2034), retry. This prevents two concurrent retry requests from both finding nothing and both creating duplicates.
- **Concurrent-retry test (mandatory):** add an integration test that submits the same import session concurrently (two parallel requests with the same `import_session_id` and overlapping rows) and verifies each intended contact is created exactly once.
- **No `@@unique([user_id, email])` constraint** is added. No deduplication of existing data. No deletion of "duplicate" contacts. No overwriting of existing contacts. The import session ID provides idempotency within a single import session without touching contact uniqueness.
- **Non-destructive:** if a contact was manually edited after the initial import, the retry won't touch it — it's already tagged with the session ID, so the retry skips it. If a contact exists with the same email but a different session ID (from a previous import), the retry creates a new contact — this is the same behavior as the initial import and is not a duplicate within the session.

**Why:** the previous approach (add `@@unique([user_id, email])` + dedup existing data + upsert on retry) was destructive — "keep the newest contact and delete the rest" could discard differing contact information, cascade-delete `EmailJob`/`EmailLog` references, and lose user data. The import session ID approach is safe: it provides idempotent retry within a session without changing contact uniqueness, without deleting anything, and without overwriting existing contacts. The only cost is a nullable column on `Contact`.

### 11.28 Field version protects contact-value writes → Serializable transactions with bounded retries

**Decision:** All operations that read a field's type and then write contact values (or mutate the field definition) must use **Serializable transaction isolation** with **bounded retries (3)**:

```ts
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    await prisma.$transaction(async (tx) => {
      // Re-read field types inside the transaction
      const fields = await tx.contactField.findMany({ where: { user_id }, select: { id: true, name: true, field_type: true, version: true } });
      // Re-validate values against CURRENT types
      for (const [token, value] of Object.entries(customValues)) {
        const field = fields.find(f => f.name === token);
        if (!field) throw new ConflictError(`Field '{{${token}}}' was deleted. Please refresh and retry.`);
        if (!validateValue(value, field.field_type)) throw new ConflictError(`Field '{{${token}}}' type changed. Value '${value}' is invalid. Please refresh and retry.`);
      }
      // Write — safe because Serializable prevents concurrent type changes from committing
      await tx.contactFieldValue.upsert(...);
    }, { isolationLevel: 'Serializable' });
    break; // success
  } catch (e) {
    if (e.code === 'P2034' && attempt < 2) continue; // serialization failure → retry
    throw e; // exhausted retries or different error
  }
}
```

This applies to: `POST /api/contacts`, `PATCH /api/contacts/[id]`, CSV import batches, `PATCH /api/contact-fields/[id]` (type changes), and `DELETE /api/contact-fields/[id]`.

**Why:** re-reading + re-validating inside a READ COMMITTED transaction leaves a window for the field type to change between the read and the write. Serializable isolation closes this window — if a concurrent field-type change commits, the contact-value write transaction fails with P2034 (serialization failure) and retries. On retry, it re-reads the (now changed) field type, re-validates, and either succeeds (if the value is still valid) or returns 409 (if not). Simply reading the version doesn't enforce this — the version check on `ContactField` protects competing field-definition edits, but not the read-validate-write cycle on contact values. Serializable + retries is the standard pattern for this class of concurrency.

### 11.29 Missing-value action → explicit `missingValueAction` parameter

**Decision:** The campaign schedule request includes an explicit `missingValueAction: "exclude" | "continue"` parameter (not just `acknowledgeMissingValues: true`):

```json
POST /api/campaigns/[id]/schedule
{
  "contactIds": ["..."],
  "templateId": "...",
  "missingValueAction": "exclude" | "continue"
}
```

**Server enforcement:** the server **always** validates ownership (user owns the campaign), recipients (contact IDs are valid and owned), template (exists and owned), and **always runs the pre-check** to detect missing values. The `missingValueAction` parameter controls the **response** to missing values, not whether the check runs:
- **`"exclude"`:** if any submitted contacts have missing values, return 400 "Exclude action submitted, but N contacts still have missing values. Please filter them out." This catches a client bug where the client said "exclude" but didn't filter.
- **`"continue"`:** missing values are explicitly permitted — proceed with literal `{{token}}` in the email body. The pre-check ran (to detect the situation), but the action allows proceeding.
- **Absent:** if there are missing values, return 400 with the pre-check result (force the user to choose). If there are no missing values, proceed (no action needed).
- **Zero-recipient guard:** if `"exclude"` and the filtered list is empty, return 400 "No recipients remaining after excluding contacts with missing values. Cannot create an empty campaign."

**Why:** with only `acknowledgeMissingValues: true`, the server can't distinguish "exclude" from "continue" — both send the same flag. An explicit action parameter lets the server enforce the client's intent and catch bugs.

---

## 12. Testing plan

All tests follow existing codebase conventions: `vitest` (`describe`, `it`, `expect`, `vi`), `@testing-library/react` for components, `vi.mock` for auth/Prisma/rate-limit in integration tests. Every new file mirrors the naming and structure of an existing neighbor. **Every phase must land its tests before the next phase begins.**

### 12.1 Unit tests — `tests/unit/`

| File | Status | Phase | Covers |
|---|---|---|---|
| `email/template.test.ts` | MODIFY | 2 | Custom tokens, prototype pollution (`{{constructor}}` etc. → literal), non-recursive resolution, HTML/script passthrough, `Object.create(null)` + `hasOwnProperty` |
| `email/template-contact.test.ts` | NEW | 2 | `buildTemplateContact`: flattens built-ins + custom into `Object.create(null)`, excludes raw Prisma fields, only approved tokens |
| `validation/contact.test.ts` | NEW | 3 | `buildCreateContactSchema`/`buildUpdateContactSchema`: each field type, required/optional, `0` and `false` preserved, date calendar validation (rejects `2026-02-31`), PATCH blank-vs-missing, 10K char limit |
| `validation/merge-field-names.test.ts` | NEW | 3 | `isReservedMergeFieldName`: built-ins, system tokens, `_` prefix, allowed names |
| `validation/contact-coercion.test.ts` | NEW | 3 | Coercion rules: `text→number` (`"abc"` ❌), `text→date` (`"2026-02-31"` ❌), `text→boolean` (`"maybe"` ❌), all valid conversions, rejects on any failure |
| `campaigns/scheduler.test.ts` | MODIFY | 6 | `generateCampaignJobs` with custom field values, snapshot-at-scheduling-time behavior, `buildTemplateContact` integration |
| `components/contacts/ContactForm.test.tsx` | MODIFY | 5 | Dynamic field rendering from `fields` prop, required validation per field, input types (text/number/date/boolean), submit body includes custom values |
| `components/contacts/ContactCard.test.tsx` | MODIFY | 5 | Custom field label/value display for non-empty values, no display for empty values |
| `components/contacts/ContactImport.test.tsx` | MODIFY | 5 | Unknown-columns prompt dialog, "Create & Import" / "Cancel" actions, updated helper text |
| `components/templates/TemplateForm.test.tsx` | MODIFY | 5 | Merge-tag picker renders label + token, inserts at cursor, appears above Subject AND Body |
| `components/settings/FieldsPage.test.tsx` | NEW | 5 | Field list, add-field form (label-first, auto-token, edit-token toggle), move up/down, delete dialog with template/contact counts |

### 12.2 Integration tests — `tests/integration/`

| File | Status | Phase | Covers |
|---|---|---|---|
| `api/contact-fields-crud.test.ts` | NEW | 4 | GET/POST/PATCH/DELETE for contact-fields, token collision rejection, type change with coercion, version conflict (409), ownership scoping (`user_id` in every `where`), rate limiting |
| `api/contact-fields-security.test.ts` | NEW | 4 | Cross-user: User A cannot GET/PATCH/DELETE User B's fields, cannot write values into User B's fields, cannot import into User B's field definitions |
| `api/contact-fields-concurrency.test.ts` | NEW | 4 | **Mock-based** (verifies app handles error codes): same-token race (P2002 → 409), version conflict (stale version → 409), delete-during-contact-update (→ 409, not no-op), P2034 retry logic. **Does NOT prove Serializable isolation** — see §12.3 for real-DB tests. |
| `api/contacts-crud.test.ts` | MODIFY | 4 | Custom field values in create/update, dynamic validation, 3-query list pattern (field defs + contacts + values), `import_session_id` tagging |
| `api/contacts-import-csv.test.ts` | MODIFY | 4 | Custom column mapping, unknown-column prompt flow, import session ID idempotency, partial-failure response (`imported`/`failed`/`failedRows`), retry without duplicates, resource limits (column/row/file-size rejection) |
| `api/campaign-schedule.test.ts` | NEW | 4 | Pre-check endpoint (missing values + unknown tokens + both subject and body), `missingValueAction: "exclude"` (400 if unfiltered), `"continue"` (proceeds with literals), absent (400 to force choice), zero-recipient guard |

### 12.3 Real-DB concurrency tests — `tests/integration/db/`

These tests connect to a real PostgreSQL database (via `@neondatabase/serverless` `Pool`) to verify that Serializable isolation and constraints actually fire at the database level. They follow the existing pattern in `tests/integration/db/gmail-oauth-migration.test.ts`: `describe.skipIf(!connectionString)` gate, `BEGIN`/`ROLLBACK` isolation, per-test schema via `randomUUID()`.

| File | Status | Phase | Covers |
|---|---|---|---|
| `contact-fields-serializable.test.ts` | NEW | 4 | **Real DB** (proves what mocks cannot): two concurrent transactions both try to create the same token → exactly one succeeds, one gets P2002; Serializable transaction aborts on interleaved write (P2034) and retry succeeds; unique constraint on `(user_id, token)` fires; foreign key on `ContactFieldValue.contact_field_id` blocks orphan writes; `version` column optimistic-lock conflict produces stale-version error |

### 12.4 E2E browser journey — `tests/e2e/`

Playwright browser test that exercises the full user journey through the real UI. Follows the existing pattern in `tests/e2e/smoke/app.spec.ts`: `@playwright/test` with `page.goto`, `getByRole`/`getByLabel` selectors, `expect(...).toBeVisible()`.

| File | Status | Phase | Covers |
|---|---|---|---|
| `custom-fields-journey.spec.ts` | NEW | 7 | **Browser journey:** (1) navigate to Settings → Fields, (2) create a "T-shirt size" field with auto-generated token, (3) add a contact with a custom field value, (4) create a template using the `{{t_shirt_size}}` merge tag via the picker, (5) schedule a campaign, (6) verify the generated email body contains the substituted value. Uses authenticated session fixture. |

### 12.5 Worker tests — `tests/worker/`

| File | Status | Phase | Covers |
|---|---|---|---|
| `scheduler.test.ts` | MODIFY | 6 | Scheduler fetches `contact_field_values` with field includes, calls `buildTemplateContact` before substitution, custom values appear in generated job `subject`/`body` |

### 12.6 Test counts (estimated)

| Level | New files | Modified files | Total |
|---|---|---|---|
| Unit | 5 | 6 | 11 |
| Integration (mock) | 4 | 2 | 6 |
| Integration (real-DB) | 1 | 0 | 1 |
| E2E | 1 | 0 | 1 |
| Worker | 0 | 1 | 1 |
| **Total** | **11** | **9** | **20** |

### 12.7 Test execution

- **Per-phase:** run `npm test` after each phase; all tests must pass before the next phase begins.
- **Full suite:** `npm test` runs all unit + integration + worker tests. Must be green at Phase 7.
- **Real-DB tests:** `OAUTH_MIGRATION_TEST_DATABASE_URL` (or equivalent `CONTACT_FIELDS_TEST_DATABASE_URL`) env var must be set; tests are skipped via `describe.skipIf` when absent.
- **E2E tests:** `npx playwright test` — run after Phase 7; requires `npm run dev` server.
- **Typecheck:** `npx tsc --noEmit` — clean at every phase.
- **Lint:** `npx eslint .` — clean at every phase.
- **Build:** `npm run build` — succeeds at Phase 7.
- **Manual smoke:** Phase 7 §7 step-by-step verification.

---

## 13. Sign-off

- [x] User has reviewed §1 (current system status) and confirmed accuracy.
- [x] User has approved §3 (hybrid architecture decision).
- [x] User has answered §11 (open questions → resolved decisions, §11.1–§11.29).
- [x] User has approved scope (Path C in, Path B out per §10).
- [x] Review 1 incorporated (CSV prompt, reserved tokens, delete counts, 3-query pattern).
- [x] Review 2 incorporated (authorization, transactional delete, coercion rules, email safety, resource limits, central reserved-token function, security + concurrency tests).
- [x] Review 3 incorporated (field-setup UX, missing-value warning, snapshot behavior, validation consistency, approved-token boundary, large-import batching, verification gates updated).
- [x] Review 4 incorporated (date calendar validation, CSV partial-failure policy, version-based concurrency, missing-value API contract, prototype-pollution safeguard, doc fixes).
- [x] Review 5 incorporated (CSV duplicate-free guarantee, field-version protects contact writes, explicit missingValueAction, 5 consistency fixes).
- [x] Review 6 incorporated (testing plan §12 added: 18 test files mapped to phases, organized by unit/integration/worker levels).
- [x] Review 7 incorporated (real-DB concurrency tests §12.3, E2E browser journey §12.4, test counts updated to 20 files).
- [x] Verification gates re-confirmed 2026-09-07: tests 39/39 ✅, tsc ✅, eslint ✅, build ✅.
- [x] User has authorized Phase 1 to begin.
- [x] All 7 phases implemented (Phase 1 schema + migration, Phase 2 substitution, Phase 3 validation, Phase 4 API, Phase 5 UI, Phase 6 scheduler, Phase 7 verification).
- [x] Built-in fields simplified (2026-09-09): `company`, `job_title`, `notes` removed; `name` made optional. Only `name` (optional) and `email` (required) remain.
- [x] All verification gates pass after simplification: 1590 tests passed, 15 skipped, 0 failed. tsc ✅, eslint ✅, build ✅.

**Status:** Implementation complete. This document has been updated to reflect the simplified built-in field set.
