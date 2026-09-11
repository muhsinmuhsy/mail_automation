# LIST_PAGE_ENHANCEMENTS

> Status: PLANNED — awaiting review before implementation.
> Created: 2026-09-11
> Supersedes: none

## 1. Objective

Add server-side search, sort (by `created_at` newest/oldest), and pagination-respecting list controls to the Attachments, Contacts, and Templates pages. Additionally:

- **Attachments**: hide the upload form behind a button + dialog.
- **Contacts**: add contact detail view, edit option, and a "Custom Fields" link. Remove "Settings" from the sidebar, move the route from `/settings/fields` to `/contacts/fields`, and rename to "Custom Fields".
- **Templates**: add search and sort.
- **Email Accounts**: no changes (already shows non-gmail providers as "Coming soon").

## 2. Principles

1. **Backend is the source of truth** — search and sort are performed server-side via Prisma `where` + `orderBy`, never client-side on a fetched slice.
2. **Respect pagination** — search/sort params are sent alongside `page` + `limit`; changing search or sort resets to page 1.
3. **Follow existing UI structure** — reuse `SearchInput`, `Pagination`, `Dialog`, `Button`, `Select`, `EmptyState`, `LoadingSpinner` from `components/ui/`.
4. **Reusable and maintainable** — create a single `SortSelect` component if none exists; share the sort/search wiring pattern across all three pages.
5. **`created_at` and `updated_at` must exist** on all list models before enabling sort-by-date.
6. **Tests** — add/update unit and integration tests for every backend and frontend change.
7. **Verification gates** — `typecheck`, `lint`, `test`, `build` must all pass.

## 3. Schema Audit

| Model | `created_at` | `updated_at` | Action |
|-------|-------------|-------------|--------|
| Attachment | ✅ exists | ❌ missing | **Add `updated_at`** to `schema.prisma` + migration SQL |
| Contact | ✅ exists | ✅ exists | None |
| Template | ✅ exists | ✅ exists | None |

### 3.1 Attachment schema change

In `prisma/schema.prisma`, add to the `Attachment` model:

```prisma
  updated_at DateTime @updatedAt @default(now()) @db.Timestamptz
```

In `prisma/migrations/20260910020208_initail/migration.sql`, add after the attachments table creation:

```sql
ALTER TABLE "attachments" ADD COLUMN "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
```

No new migration directory — append to the consolidated migration (same approach as CHECK constraints).

## 4. Reusable UI Components

### 4.1 SearchInput (existing)

File: `components/ui/SearchInput.tsx` — already implemented. Props: `value`, `onChange`, `placeholder?`, `label?`.

### 4.2 SortSelect (new — create if not exists)

File: `components/ui/SortSelect.tsx`

A lightweight sort dropdown using the existing `Select` component. Props:

```typescript
interface SortSelectProps {
  value: 'desc' | 'asc';       // desc = newest first, asc = oldest first
  onChange: (value: 'desc' | 'asc') => void;
  label?: string;              // default: 'Sort'
}
```

Renders two options:
- `desc` → "Newest first"
- `asc` → "Oldest first"

This is the only sort dimension requested (by `created_at`). If more sort fields are needed later, extend with a `sortBy` prop + options list.

### 4.3 ListToolbar (new — reusable wrapper)

File: `components/ui/ListToolbar.tsx`

A flex row containing `SearchInput` + `SortSelect` + optional children (e.g. "Upload" button). Props:

```typescript
interface ListToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortOrder: 'desc' | 'asc';
  onSortOrderChange: (value: 'desc' | 'asc') => void;
  children?: React.ReactNode;
}
```

This keeps the search+sort layout consistent across all list pages.

## 5. Backend Changes

### 5.1 Shared pattern

All three API routes already use `parseListQuery(req, { search: true })` from `lib/api/list.ts`. The `parseListQuery` helper already supports `sortable` allow-lists. The only backend change needed is:

1. Pass `sortable: ['created_at']` to `parseListQuery`.
2. Build `orderBy` dynamically from the parsed `sortBy` / `sortOrder` instead of hardcoding.

### 5.2 Attachments API (`app/api/attachments/route.ts`)

Current:
```typescript
const { page, limit, search } = parseListQuery(req, { search: true });
// ...
orderBy: { created_at: 'desc' },
```

Change to:
```typescript
const { page, limit, search, sortBy, sortOrder } = parseListQuery(req, { search: true, sortable: ['created_at'] });
// ...
orderBy: { [sortBy ?? 'created_at']: sortOrder },
```

Also add `updated_at` to the Prisma `select` clause.

### 5.3 Contacts API (`app/api/contacts/route.ts`)

Same pattern — pass `sortable: ['created_at']` and build `orderBy` dynamically.

### 5.4 Templates API (`app/api/templates/route.ts`)

Same pattern — pass `sortable: ['created_at']` and build `orderBy` dynamically.

### 5.5 Contacts detail API (`app/api/contacts/[id]/route.ts`)

Already implements `GET` (returns contact + custom field values) and `PATCH` (updates contact + upserts/deletes custom field values). **No backend changes needed** — just wire the frontend.

## 6. Frontend Changes

### 6.1 Attachments page (`app/(dashboard)/attachments/page.tsx`)

**Changes:**
1. Replace the always-visible upload card with an "Upload Attachment" button in a `ListToolbar`.
2. Clicking the button opens a `Dialog` containing the existing `AttachmentUpload` component.
3. Add `SearchInput` + `SortSelect` to the `ListToolbar`.
4. Add `search` and `sortOrder` state; pass them as query params (`search`, `sortOrder`).
5. Reset to page 1 when search or sort changes.
6. Include `created_at` in the frontend `Attachment` type and display it in `AttachmentCard`.

**State additions:**
```typescript
const [search, setSearch] = useState('');
const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
const [uploadOpen, setUploadOpen] = useState(false);
```

**Query params:**
```typescript
const params = new URLSearchParams({
  page: String(page),
  limit: String(PAGE_SIZE),
  ...(search && { search }),
  sortOrder,
});
```

### 6.2 Contacts page (`app/(dashboard)/contacts/page.tsx`)

**Changes:**
1. Add `SearchInput` + `SortSelect` via `ListToolbar`.
2. Add `search` and `sortOrder` state; pass as query params.
3. Reset to page 1 when search or sort changes.
4. Add a "Custom Fields" button/link in the toolbar that navigates to `/settings/fields`.
5. Add "View" and "Edit" buttons to each `ContactCard`.
   - "View" → navigate to `/contacts/[id]` (new detail page).
   - "Edit" → open a `ContactEditDialog` (or navigate to `/contacts/[id]?edit=true`).

**New page: `app/(dashboard)/contacts/[id]/page.tsx`**

Contact detail page showing:
- Built-in fields: name, email
- Custom fields: label/value pairs (fetched from `/api/contacts/[id]`)
- "Edit" button → opens edit form
- "Back" link to `/contacts`

**New/edit dialog: `components/contacts/ContactEditDialog.tsx`**

Edit form using the existing `ContactForm` component (which already supports custom fields). On submit, calls `PATCH /api/contacts/[id]`. On success, refreshes the list.

### 6.3 Contacts — Custom Fields route move & sidebar rename

**Route move:**
1. Move `app/(dashboard)/settings/fields/page.tsx` → `app/(dashboard)/contacts/fields/page.tsx`.
2. Delete the now-empty `app/(dashboard)/settings/` directory.
3. The new route is `/contacts/fields` — reflects that Custom Fields belong to Contacts, not Settings.
4. API routes stay at `/api/contact-fields` and `/api/contact-fields/[id]` — already correctly named.

**Sidebar (`components/layout/DashboardSidebar.tsx`):**
1. Remove the `{ href: '/settings/fields', label: 'Settings', icon: 'ST' }` item.
2. The mobile nav already omits it — no change needed there.

**Custom Fields page (`app/(dashboard)/contacts/fields/page.tsx`):**
1. Page `<h1>` is already "Custom Fields" — verify and keep.
2. Route is now `/contacts/fields` — belongs to contacts domain.

**Contacts page toolbar:**
1. Add a "Custom Fields" button (using existing `Button` component, `variant="secondary"`) that navigates to `/contacts/fields` via `next/link` or `router.push`.

**Header (`components/layout/DashboardHeader.tsx`):**
1. Remove or comment out the "Settings" → `/settings` dead link in the account dropdown.

**Backend naming:**
1. Search for any function/variable named `settings` related to contact fields and rename to `customFields` or `contactFields`. The API routes are already at `/api/contact-fields` — no rename needed there.

### 6.4 Templates page (`app/(dashboard)/templates/page.tsx`)

**Changes:**
1. Add `SearchInput` + `SortSelect` via `ListToolbar`.
2. Add `search` and `sortOrder` state; pass as query params.
3. Reset to page 1 when search or sort changes.
4. Keep the existing "New template" button in the toolbar (as a child of `ListToolbar`).

## 7. Test Plan

### 7.1 Backend tests

| File | Tests |
|------|-------|
| `tests/integration/api/attachments-list.test.ts` (new or existing) | Search by filename, sort by `created_at` asc/desc, pagination with search+sort |
| `tests/integration/api/contacts-list.test.ts` (new or existing) | Search by name/email, sort by `created_at` asc/desc, pagination with search+sort |
| `tests/integration/api/templates-list.test.ts` (new or existing) | Search by name, sort by `created_at` asc/desc, pagination with search+sort |
| `tests/unit/api/list.test.ts` (existing) | Verify `parseListQuery` returns `sortBy`/`sortOrder` when `sortable` is provided |

### 7.2 Frontend tests

| File | Tests |
|------|-------|
| `tests/unit/components/ui/SortSelect.test.tsx` (new) | Renders options, calls onChange |
| `tests/unit/components/ui/ListToolbar.test.tsx` (new) | Renders search + sort + children, calls handlers |
| `tests/unit/components/attachments/AttachmentPage.test.tsx` (update) | Upload behind button, search/sort wiring |
| `tests/unit/components/contacts/ContactsPage.test.tsx` (update) | Search/sort wiring, Custom Fields link, View/Edit buttons |
| `tests/unit/components/contacts/ContactDetailPage.test.tsx` (new) | Renders contact + custom fields, edit button |
| `tests/unit/components/contacts/ContactEditDialog.test.tsx` (new) | Edit form, PATCH call, custom fields |
| `tests/unit/components/templates/TemplatesPage.test.tsx` (update) | Search/sort wiring |

### 7.3 Schema test

| File | Test |
|------|------|
| `tests/integration/db/check-constraints.test.ts` (existing) | Verify `updated_at` column exists on attachments table in migration SQL |

## 8. Implementation Order

1. **Schema**: Add `updated_at` to Attachment model + migration SQL.
2. **Reusable components**: Create `SortSelect` and `ListToolbar`.
3. **Backend**: Enable `sortable` in attachments, contacts, templates API routes.
4. **Attachments page**: Upload behind button, search, sort.
5. **Templates page**: Search, sort.
6. **Contacts page**: Search, sort, Custom Fields link, View/Edit.
7. **Contact detail page**: New `/contacts/[id]` page.
8. **Sidebar + header**: Remove "Settings" item, fix dead link.
9. **Tests**: Add/update all tests per §7.
10. **Verification gates**: `typecheck`, `lint`, `test`, `build` — all must pass.

## 9. Files to Create

| File | Purpose |
|------|---------|
| `components/ui/SortSelect.tsx` | Reusable sort dropdown (newest/oldest) |
| `components/ui/ListToolbar.tsx` | Reusable search + sort + actions row |
| `components/contacts/ContactEditDialog.tsx` | Edit contact + custom fields |
| `app/(dashboard)/contacts/[id]/page.tsx` | Contact detail page |
| `app/(dashboard)/contacts/fields/page.tsx` | Custom Fields management page (moved from `/settings/fields`) |
| `tests/unit/components/ui/SortSelect.test.tsx` | SortSelect tests |
| `tests/unit/components/ui/ListToolbar.test.tsx` | ListToolbar tests |
| `tests/unit/components/contacts/ContactDetailPage.test.tsx` | Detail page tests |
| `tests/unit/components/contacts/ContactEditDialog.test.tsx` | Edit dialog tests |

## 10. Files to Modify

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `updated_at` to Attachment model |
| `prisma/migrations/20260910020208_initail/migration.sql` | Add `updated_at` column to attachments table |
| `app/api/attachments/route.ts` | Enable `sortable`, dynamic `orderBy`, add `updated_at` to select |
| `app/api/contacts/route.ts` | Enable `sortable`, dynamic `orderBy` |
| `app/api/templates/route.ts` | Enable `sortable`, dynamic `orderBy` |
| `app/(dashboard)/attachments/page.tsx` | Upload behind button+dialog, search, sort |
| `app/(dashboard)/contacts/page.tsx` | Search, sort, Custom Fields link (`/contacts/fields`), View/Edit buttons |
| `app/(dashboard)/templates/page.tsx` | Search, sort |
| `components/attachments/AttachmentCard.tsx` | Display `created_at` |
| `components/contacts/ContactCard.tsx` | Add View/Edit buttons |
| `components/layout/DashboardSidebar.tsx` | Remove "Settings" item |
| `components/layout/DashboardHeader.tsx` | Remove/fix "Settings" dead link |

## 11. Out of Scope

- Email Accounts page (already shows "Coming soon" for non-gmail providers).
- Campaigns page (not mentioned in requirements).
- Emails page (not mentioned in requirements).
- Changing the `/api/contact-fields` API route path (stays as-is, already correctly named).
- Adding `updated_at` to the Attachment UI display (only `created_at` is displayed).
- Keeping the `/settings/` directory — it is removed entirely (only contained the Custom Fields page).
