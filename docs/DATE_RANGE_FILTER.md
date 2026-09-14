# DATE RANGE FILTER — Plan Document

## Goal

Add a reusable, backend-level start-date + end-date filter to 5 list pages:
`/attachments`, `/contacts`, `/templates`, `/campaigns`, `/emails`.

The filter must follow the existing folder/file structure, be reusable across all
pages, and respect pagination + search + sort + status filters.

---

## 2. Best Approach — Chosen Design

### Modern world handling

Modern SaaS apps (Linear, Vercel, GitHub, Stripe) use:
- Native HTML5 `<input type="date">` for date-only picking (no heavy JS date library)
- Backend-level filtering via query params (`startDate`, `endDate`)
- The filter lives in the toolbar alongside search/sort, not in a separate sidebar
- Changing the filter resets to page 1
- The filter is optional — clearing it shows all records

### Chosen option for this system

**Reusable `DateRangeFilter` UI component + shared backend parsing.**

- **UI**: A new `DateRangeFilter` component goes into the existing `ListToolbar.filters` slot (already used by campaigns/emails for status). Two native `<input type="date">` fields (From / To) with a Clear button. No new dependency.
- **Backend**: Extend `parseListQuery` with an optional `dateRange` option. Each route declares which date column to filter on (e.g., `created_at` for attachments/contacts/templates/campaigns, `created_at` for emails). The helper parses `startDate` / `endDate` query params and returns a Prisma `where` fragment.
- **Date field selector**: NOT included in v1. Each page filters on `created_at` only — consistent with the existing sort behavior (all pages sort by `created_at`). A per-page `dateField` prop allows future expansion without API changes.

### Why not other options

| Option | Why not |
|---|---|
| Client-side filtering | Violates existing convention — all search/sort is backend-driven |
| Third-party date picker (react-datepicker, etc.) | Adds dependency for a simple date input; native `<input type="date">` is sufficient and zero-dependency |
| Separate filter sidebar/drawer | Over-engineered for 2 date fields; breaks the existing toolbar layout |
| Per-field date selector dropdown in v1 | Adds complexity; all pages sort by `created_at` so filtering by `created_at` is the natural match. Can be added later. |

---

## 3. Architecture

### 3.1 New files

```
components/ui/DateRangeFilter.tsx     — Reusable UI component
lib/api/list.ts                        — Extended (existing file)
tests/unit/components/ui/DateRangeFilter.test.tsx — UI tests
tests/unit/api/list-date-range.test.ts — Backend parsing tests
```

### 3.2 `DateRangeFilter` component

```tsx
// components/ui/DateRangeFilter.tsx
'use client';

interface DateRangeFilterProps {
  startDate: string;          // ISO date string (yyyy-mm-dd) or ''
  endDate: string;            // ISO date string (yyyy-mm-dd) or ''
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onClear: () => void;
  label?: string;             // default 'Date range'
}
```

- Two native `<input type="date">` inputs side by side
- "Clear" button (shown when either date is set)
- Styled to match existing `SearchInput` / `Select` components (same border, radius, height)
- No popup, no calendar widget — native browser date picker

### 3.3 `parseListQuery` extension

```ts
// lib/api/list.ts — extended
export interface ListQuery {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  startDate?: string;   // NEW — ISO date string
  endDate?: string;     // NEW — ISO date string
}

export function parseListQuery(
  req: NextRequest,
  options: {
    search?: boolean;
    sortable?: readonly string[];
    dateRange?: boolean;   // NEW — parse startDate/endDate if true
  } = {}
): ListQuery {
  // ... existing parsing ...
  const startDate = options.dateRange
    ? (searchParams.get('startDate')?.toString().trim() || undefined)
    : undefined;
  const endDate = options.dateRange
    ? (searchParams.get('endDate')?.toString().trim() || undefined)
    : undefined;
  return { ...result, startDate, endDate };
}
```

### 3.4 Helper to build Prisma `where` date fragment

```ts
// lib/api/list.ts — new helper
export function dateRangeWhere(
  field: string,
  startDate?: string,
  endDate?: string
): Record<string, { gte?: Date; lte?: Date }> | {} {
  if (!startDate && !endDate) return {};
  return {
    [field]: {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate + 'T23:59:59.999Z') } : {}),
    },
  };
}
```

The `endDate` gets `T23:59:59.999Z` appended so "Sep 14" includes all of Sep 14, not just 00:00:00.

### 3.5 Route changes (5 routes)

Each route adds `dateRange: true` to `parseListQuery` options and spreads `dateRangeWhere()` into the `where` clause.

**Example — `app/api/contacts/route.ts`:**
```ts
const { page, limit, search, sortBy, sortOrder, startDate, endDate } =
  parseListQuery(req, { search: true, sortable: ['created_at'], dateRange: true });

const where = {
  user_id: ctx.user.id,
  ...dateRangeWhere('created_at', startDate, endDate),
  ...(search ? { OR: [...] } : {}),
};
```

**Date field per page:**

| Page | Date field | Reason |
|---|---|---|
| `/attachments` | `created_at` | Only meaningful date (updated_at is similar, deleted_at is soft-delete) |
| `/contacts` | `created_at` | When the contact was added |
| `/templates` | `created_at` | When the template was created |
| `/campaigns` | `created_at` | When the campaign was created (start_at is the scheduled start, not creation) |
| `/emails` | `created_at` | When the email job was created (scheduled_at/sent_at are business dates but created_at is universal) |

### 3.6 Frontend page changes (5 pages)

Each page adds:
1. State: `const [startDate, setStartDate] = useState('')` + `const [endDate, setEndDate] = useState('')`
2. Fetch: add `startDate` / `endDate` to `URLSearchParams` if set
3. `ListToolbar` `filters` slot: `<DateRangeFilter ...>` (alongside existing Status `<Select>` for campaigns/emails)
4. `handleStartChange` / `handleEndChange` / `handleDateClear`: all reset `page` to 1
5. Clear button clears both dates and resets page

---

## 4. Test Plan

### 4.1 Unit tests — `DateRangeFilter` component
- Renders two date inputs with labels
- Calls `onStartChange` / `onEndChange` when dates change
- Shows Clear button when either date is set
- Clear button calls `onClear`
- Hides Clear button when both dates are empty

### 4.2 Unit tests — `parseListQuery` date range
- Parses `startDate` and `endDate` when `dateRange: true`
- Returns `undefined` for dates when `dateRange` not set
- Returns `undefined` for empty/whitespace date params
- `dateRangeWhere` builds correct Prisma `where` fragment
- `dateRangeWhere` with only `startDate` → only `gte`
- `dateRangeWhere` with only `endDate` → only `lte` with end-of-day
- `dateRangeWhere` with neither → empty object

### 4.3 Verification gates
- `npx vitest run` — all tests pass
- `npx tsc --noEmit` — typecheck clean
- `npx eslint .` — lint clean
- `npx next build` — build succeeds

---

## 5. Files to create/modify

### Create:
- `components/ui/DateRangeFilter.tsx`
- `tests/unit/components/ui/DateRangeFilter.test.tsx`
- `tests/unit/api/list-date-range.test.ts`

### Modify:
- `lib/api/list.ts` — add `startDate`/`endDate` to `ListQuery`, `dateRange` option, `dateRangeWhere` helper
- `app/api/attachments/route.ts` — add `dateRange: true`, spread `dateRangeWhere`
- `app/api/contacts/route.ts` — same
- `app/api/templates/route.ts` — same
- `app/api/campaigns/route.ts` — same
- `app/api/emails/route.ts` — same
- `app/(dashboard)/attachments/page.tsx` — add date range state + UI
- `app/(dashboard)/contacts/page.tsx` — same
- `app/(dashboard)/templates/page.tsx` — same
- `app/(dashboard)/campaigns/page.tsx` — same (alongside existing status filter)
- `app/(dashboard)/emails/page.tsx` — same (alongside existing status filter)

---

## 6. What this plan does NOT include

- Date field selector dropdown (filter by `created_at` vs `sent_at` vs `scheduled_at`) — future enhancement
- Relative date presets ("Last 7 days", "Last 30 days") — future enhancement
- Server-side date validation (invalid date strings) — native `<input type="date">` prevents invalid input; backend `new Date()` is forgiving
- Admin routes (`/api/admin/emails`, `/api/admin/campaigns`) — can be added later with the same pattern
