# Reusable List Components Refactoring

**Status:** IMPLEMENTED
**Date:** 2026-09-12

## Problem

All 6 list pages (attachments, campaigns, contacts, templates, emails, email-accounts) render their lists inline. Each page duplicates: fetch → loading → error → empty → list map → pagination. The existing `*List` and `*Card` components are dead stubs with truncated types and no action callbacks.

## Goal

Refactor all 6 list pages to use their `*List` components, which delegate to `*Card` components. Pages stay thin: own state + fetch + dialogs, delegate rendering to components.

## Architecture: Presentational List Components

Each `*List` component is **presentational** — receives items + callbacks, renders the layout + maps to `*Card`. No data fetching inside components.

```
Page (owns state, fetch, dialogs)
  └── ListToolbar (search + sort + action buttons)
  └── XxxList (presentational: items + callbacks)
       └── XxxCard per item (presentational: item + callbacks)
  └── Pagination
  └── Dialogs (create/edit/delete/confirm)
```

## Three Layout Variants

| Layout | Pages | CSS |
|--------|-------|-----|
| Card grid | Contacts, Templates | `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4` |
| Divide-y rows | Campaigns, Email Accounts | `divide-y` inside bordered container |
| Single column stack | Attachments | `flex flex-col gap-4` |
| DataTable | Emails | Tabular — `EmailList` wraps `DataTable` |

## Per-Component Changes

### 1. ContactList (Low effort)

**Current:** Dead stub, inline divs, no `ContactCard`, no actions.  
**Change:** Accept full `Contact` type + `fieldLabels` + action callbacks (`onDelete`, `onView`, `onEdit`, `deletingId`). Render grid wrapper + map to `ContactCard`.  
**Page change:** Replace inline grid map with `<ContactList contacts={contacts} fieldLabels={...} onView={...} onEdit={...} onDelete={...} deletingId={...} />`.

### 2. TemplateList (Low effort)

**Current:** Dead stub, inline divs, no `TemplateCard`, no actions.  
**Change:** Accept full `Template` type + `onEdit` + `onPreview`. Render grid wrapper + map to `TemplateCard`.  
**Page change:** Replace inline grid map with `<TemplateList templates={templates} onEdit={...} onPreview={...} />`.

### 3. EmailAccountList (Low effort)

**Current:** Dead stub, inline divs, no `EmailAccountCard`, no actions.  
**Change:** Accept full `EmailAccount` type + action callbacks (`onTest`, `onDeactivate`, `onReactivate`, `onReconnect`, `onDisconnect`). Render divide-y container + map to `EmailAccountCard`.  
**Page change:** Replace inline divide-y map with `<EmailAccountList accounts={accounts} onTest={...} ... />`.

### 4. AttachmentList (Low-Medium effort)

**Current:** Dead stub, inline divs, no `AttachmentCard`, no `created_at`.  
**Change:** Accept full `Attachment` type (with `created_at`). Render single-column stack + map to `AttachmentCard`.  
**Page change:** Replace inline stack map with `<AttachmentList attachments={attachments} />`.

### 5. CampaignList + CampaignCard (High effort)

**Current:** Both are dead stubs. `CampaignCard` renders only name + status text. Page renders rich rows with 6+ fields + 4 action buttons + `StatusBadge`.  
**Change:**  
- **CampaignCard:** Rebuild to accept full campaign row type + `busy` flag + callbacks (`onView`, `onPause`, `onResume`, `onCancel`). Render name, scheduled time, interval/daily_limit, `StatusBadge`, action buttons. Match the current inline row exactly.  
- **CampaignList:** Accept full campaign type + `busyId` + action callbacks. Render divide-y container + map to `CampaignCard`.  
**Page change:** Replace inline divide-y rows with `<CampaignList campaigns={campaigns} busyId={...} onView={...} onPause={...} onResume={...} onCancel={...} />`.

### 6. EmailList (High effort — table, not cards)

**Current:** Page uses `DataTable` with 6 columns. `EmailCard`/`EmailList` are dead stubs with 4 fields.  
**Change:**  
- **EmailList:** Repurpose as a table wrapper. Accept `emails` array + `onRetry` callback. Render `DataTable` with the column definitions (extracted from the page).  
- **EmailCard:** Keep for potential future detail/card view but do NOT use in the list page.  
**Page change:** Replace inline `DataTable` + column defs with `<EmailList emails={emails} onRetry={...} />`.

## ListToolbar Enhancement

**Current:** Only supports search + sortOrder (asc/desc). Campaigns and Emails pages use raw `SearchInput` + `Select` for status filter instead.  
**Change:** Add optional `filters?: React.ReactNode` slot to `ListToolbar`. Campaigns/Emails pass their status `<Select>` as `filters`. This unifies the toolbar across all pages.

```tsx
// Before (Campaigns page):
<SearchInput ... />
<Select ... />

// After:
<ListToolbar search={...} onSearchChange={...} filters={<Select ... />}>
  <Button>New Campaign</Button>
</ListToolbar>
```

## What Stays in Pages

Pages continue to own:
- Data fetching (fetch, load, AbortController, auto-refresh)
- State (page, search, sortOrder, status filter, loading, error)
- Side dialogs (create, edit, delete confirm, import, wizard)
- Toast notifications
- OAuth redirect handling

## What Moves to Components

- List rendering (layout wrapper + card mapping)
- Empty state rendering
- Card-level action buttons

## Files Modified

| File | Change |
|------|--------|
| `components/contacts/ContactList.tsx` | Rewrite: presentational, delegate to ContactCard |
| `components/templates/TemplateList.tsx` | Rewrite: presentational, delegate to TemplateCard |
| `components/email-accounts/EmailAccountList.tsx` | Rewrite: presentational, delegate to EmailAccountCard |
| `components/attachments/AttachmentList.tsx` | Rewrite: presentational, delegate to AttachmentCard |
| `components/campaigns/CampaignCard.tsx` | Rebuild: rich row with StatusBadge + actions |
| `components/campaigns/CampaignList.tsx` | Rewrite: presentational, delegate to CampaignCard |
| `components/emails/EmailList.tsx` | Rewrite: DataTable wrapper with column defs |
| `components/ui/ListToolbar.tsx` | Add optional `filters` slot |
| `app/(dashboard)/attachments/page.tsx` | Use `<AttachmentList>` |
| `app/(dashboard)/campaigns/page.tsx` | Use `<CampaignList>` + `ListToolbar` with filters |
| `app/(dashboard)/contacts/page.tsx` | Use `<ContactList>` |
| `app/(dashboard)/templates/page.tsx` | Use `<TemplateList>` |
| `app/(dashboard)/emails/page.tsx` | Use `<EmailList>` + `ListToolbar` with filters |
| `app/(dashboard)/email-accounts/page.tsx` | Use `<EmailAccountList>` |

## Files NOT Modified

- `components/contacts/ContactCard.tsx` — already good
- `components/templates/TemplateCard.tsx` — already good
- `components/email-accounts/EmailAccountCard.tsx` — already good
- `components/attachments/AttachmentCard.tsx` — already good
- `components/emails/EmailCard.tsx` — kept but not used in list page
- All API routes — no backend changes
- All `*Form` components — not part of this refactoring

## Test Updates

- Update existing `*List.test.tsx` tests to match new presentational interfaces
- Update existing `*Card.test.tsx` tests if card props change (CampaignCard)
- Update page tests if inline rendering assertions change
- All 4 verification gates must pass: typecheck, lint, test, build

## Implementation Order

1. `ListToolbar` — add `filters` slot (foundation)
2. `ContactList` + page (lowest risk, good card already exists)
3. `TemplateList` + page (same pattern as contacts)
4. `EmailAccountList` + page (no pagination, simplest)
5. `AttachmentList` + page
6. `CampaignCard` + `CampaignList` + page (highest complexity)
7. `EmailList` + page (table wrapper)
8. Run all 4 verification gates
