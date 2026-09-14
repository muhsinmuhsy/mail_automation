# Campaign Wizard UX Improvements

Status: PLAN — awaiting review before implementation.

## Context

The campaign deduplication backend is complete and working. The pre-check endpoint
correctly classifies contacts and returns eligibility data. However, the wizard UI has
two categories of problems:

1. **Loading UX** — the UI shows nothing while waiting 1-5s for API responses (IMPLEMENTED)
2. **Business logic UX** — the user doesn't understand what "Already scheduled" means,
   why they can continue with zero eligible recipients, or how to resend (THIS PLAN)

---

## Part A: Loading UX (ALREADY IMPLEMENTED)

These changes are complete and tested:

- **Skeleton card** during initial pre-check: "Checking recipients..." with spinner
- **Skeleton badges** on contact rows while recipient-status loads: pulsing placeholder
- **Stale-while-revalidate**: previous result stays visible with "Updating..." spinner
- **recipientStatusLoading state**: tracks when recipient-status fetch is in progress

---

## Part B: Business Logic UX (THIS PLAN)

### Core Principle

**Never lock the checkbox, always explain what will happen.** The hard block is the
Schedule button, not the contact selection. But don't let the user waste navigation
steps either.

### Problem Statements

1. User selects ONLY "Already scheduled" contacts → zero eligible → can still navigate
   to Schedule and Review steps → wastes time discovering Schedule button is disabled
2. User selects a mix of eligible + excluded → sees counts but doesn't understand
   WHY contacts are excluded or WHAT to do about it
3. User wants to resend to an "Already scheduled" contact → no explanation of how
4. User doesn't understand the lifecycle: "Already scheduled" is temporary, becomes
   "Previously emailed" after sending, then follow-up is possible

### Badge Lifecycle (from spec §3.2)

| Job status | Badge | Can send again? | Follow-up? |
|---|---|---|---|
| SCHEDULED, QUEUED, PROCESSING, RETRY_WAIT | "Already scheduled" | No (in flight) | No |
| SENT | "Previously emailed using this template" | Yes | Yes |
| DELIVERY_UNKNOWN | "Delivery needs review" | No (admin must resolve) | No |
| FAILED, CANCELLED | (no badge) | Yes | N/A |
| No history | (no badge) | Yes | N/A |

---

### Contacts Step — 3 States

**State 1: All eligible (normal flow)**
- "5 emails will be scheduled" — Continue normally
- No badges, no warnings — clean UX

**State 2: Some eligible, some excluded**
- "3 emails will be scheduled · 2 excluded" with "View details"
- Badges on excluded rows with tooltips explaining why and what to do
- "Choose follow-ups" link if any SENT contacts exist
- Continue works normally — only eligible contacts will be scheduled

**State 3: Zero eligible (the problem case)**
- Prominent alert: "No emails will be scheduled"
- Contextual actions below the alert:
  - If SENT contacts exist → "Choose follow-ups" button (resend to completed)
  - If PENDING contacts exist → "N contacts have emails in queue — wait for them to complete or cancel the existing campaigns"
  - Always → "Use a different template or sending account" link (different dedup scope)
- Disable "Continue" button — show "Resolve above to continue"
- No wasted navigation to Schedule/Review

---

### Solution: 4 UI changes (all UI-only, no backend changes)

#### Change 1: Badge tooltips

Add `title` attribute (or tooltip) to each badge explaining what it means and what
the user can do.

| Badge | Tooltip text |
|---|---|
| **Already scheduled** | "Email is queued in another campaign with this template and account. It will be excluded. Once sent, you can follow up. To send now: cancel the existing campaign or use a different template/account." |
| **Previously emailed** | "Already received this template from this account. Click 'Choose follow-ups' to send again." |
| **Delivery needs review** | "A previous send has unknown status. An admin must resolve it before this contact can receive emails." |

This directly answers Problem 4 — the tooltip explains the lifecycle: "Already scheduled"
is temporary, becomes "Previously emailed" after sending, and then follow-up is possible.

**Implementation:** Add `title` prop to Badge component or wrap in a span with title.

---

#### Change 2: Zero-eligible warning on Contacts step

When `eligibility.isReady && eligibility.result.eligibleCount === 0`:

Show a prominent alert box ABOVE the contact list (not inside the summary card):

```
┌─────────────────────────────────────────────────────┐
│  No emails will be scheduled                         │
│                                                       │
│  All selected contacts are excluded:                  │
│  • 2 Already scheduled (emails in queue)             │
│  • 1 Previously emailed (use follow-ups to resend)   │
│  • 1 Delivery needs review (admin action required)   │
│                                                       │
│  [Choose follow-ups]  [Use different template/account]│
└─────────────────────────────────────────────────────┘
```

**Rules:**
- "Choose follow-ups" button appears ONLY if there are SENT contacts
  (excludedByReason.previouslySent > 0)
- "Use different template/account" is always shown (links back to Content step)
- If only PENDING contacts: show "Wait for emails to complete or cancel existing campaigns"
- If only DELIVERY_UNKNOWN: show "An admin must resolve delivery issues first"
- The alert uses existing Alert/ErrorState component patterns

---

#### Change 3: Disable "Continue" button at zero eligible

When `eligibility.isReady && eligibility.result.eligibleCount === 0`:

- Disable the "Continue" button
- Change button text to "No eligible recipients" or keep "Continue" but disabled
- The zero-eligible warning (Change 2) explains why and provides actions

**When eligibleCount > 0:** Continue works normally, even if some contacts are excluded.

**Why disable Continue at zero eligible?**

If all contacts are excluded:
- Schedule step serves no purpose (no emails to time)
- Review step serves no purpose (nothing to review)
- The user wastes 2 clicks discovering this

By disabling Continue with "Resolve above to continue," the user stays on the Contacts
step where they can take action (follow-ups, change template, choose different contacts).

**But** if some contacts ARE eligible (even 1 out of 100), Continue works — because
that 1 email needs scheduling.

---

#### Change 4: Schedule/Review steps warning at zero eligible

Although Change 3 prevents reaching these steps with zero eligible, the user might
have navigated back from Review to Contacts, deselected all eligible contacts, and
then go forward again. So add a safety net:

**Schedule step (step 3):**
- If zero eligible: show warning banner "No emails will be scheduled — go back to Contacts"
- Schedule form is still visible but the Continue button shows "Back to Contacts"

**Review step (step 4):**
- If zero eligible: disable Schedule button with "No eligible recipients"
- Show "Back to Contacts" button prominently

---

### All Combination Scenarios (Universal Rule)

The same logic handles all combinations — no special cases needed:

```
eligibleCount = eligibleContacts + sentContactsChosenForFollowUp
excludedCount = pending + sentNotChosen + deliveryUnknown + missingValues
```

- Continue is disabled only when eligible count = 0
- "Choose follow-ups" appears only when SENT contacts are selected
- Each badge has a tooltip explaining what to do
- The UI doesn't need different code paths per scenario — it shows counts, badges,
  and follow-up option. The user understands from the summary + tooltips.

---

#### Scenario 1: Already scheduled + Previously emailed (no eligible)

| Contact type | Default | With follow-up? | Result |
|---|---|---|---|
| Already scheduled (PENDING) | Excluded | Still excluded | Not sent |
| Previously emailed (SENT) | Excluded | **Included** | Sent if chosen |

**UI:** Summary shows "0 emails will be scheduled · 2 excluded." "Choose follow-ups"
link appears (SENT contacts exist). User clicks it → selects SENT contacts → they
become included → summary updates to "1 email will be scheduled."

**If user doesn't choose follow-ups:** Zero eligible → warning with "Choose follow-ups"
button. Continue disabled.

---

#### Scenario 2: Already scheduled + Previously emailed + Delivery needs review (no eligible)

| Contact type | Default | With follow-up? | Result |
|---|---|---|---|
| Already scheduled (PENDING) | Excluded | Still excluded | Not sent |
| Previously emailed (SENT) | Excluded | **Included** | Sent if chosen |
| Delivery needs review (UNKNOWN) | Excluded | Still excluded | Not sent (admin must resolve) |

**UI:** Summary shows "0 emails will be scheduled · 3 excluded." "Choose follow-ups"
link appears. Details show 3 reasons: "Already scheduled: 1 · Previously emailed: 1 ·
Delivery needs review: 1."

**If user doesn't choose follow-ups:** Zero eligible → warning with:
- "Choose follow-ups" button (for the SENT contact)
- "1 contact needs admin review for delivery issues"
- Continue disabled.

**Key point:** Delivery needs review is the hardest block — only an admin can resolve
it. The tooltip says: "A previous send has unknown status. An admin must resolve it
before this contact can receive emails."

---

#### Scenario 3: Already scheduled + Previously emailed + Eligible

| Contact type | Default | With follow-up? | Result |
|---|---|---|---|
| Already scheduled (PENDING) | Excluded | Still excluded | Not sent |
| Previously emailed (SENT) | Excluded | **Included** | Sent if chosen |
| Eligible (no history) | **Included** | N/A | Sent |

**UI:** Summary shows "1 email will be scheduled · 2 excluded." Continue works normally
(the eligible contact will be sent). "Choose follow-ups" link appears — if used, the
SENT contact also becomes included → "2 emails will be scheduled."

**This is the normal mixed flow** — no warning needed, just the summary with counts.
The user understands: "I selected 3, 1 will be sent, 2 are excluded."

---

#### Scenario 4: Already scheduled + Previously emailed + Delivery needs review + Eligible

| Contact type | Default | With follow-up? | Result |
|---|---|---|---|
| Already scheduled (PENDING) | Excluded | Still excluded | Not sent |
| Previously emailed (SENT) | Excluded | **Included** | Sent if chosen |
| Delivery needs review (UNKNOWN) | Excluded | Still excluded | Not sent |
| Eligible (no history) | **Included** | N/A | Sent |

**UI:** Summary shows "1 email will be scheduled · 3 excluded." Continue works (eligible
contact will be sent). "View details" shows: "Already scheduled: 1 · Previously emailed:
1 · Delivery needs review: 1." "Choose follow-ups" link appears for the SENT contact.

**If user chooses follow-up for the SENT contact:** "2 emails will be scheduled · 2 excluded."

---

### Why This Is Best for Our System

1. **UI-only** — no new API endpoints, no backend changes, no schema changes
2. **Spec-compliant** — §4.2 line 137: "show why and offer the relevant edit action;
   disable scheduling"
3. **Solves all 4 concerns:**
   - Q1: Continue disabled at zero eligible — no wasted steps
   - Q2: Badges + tooltips + summary explain exactly what's excluded and why
   - Q3: Tooltip gives 3 concrete options (wait, cancel, different template/account)
   - Q4: Tooltip explains the lifecycle (PENDING → SENT → follow-up available)
4. **Progressive disclosure** — normal flow (all eligible) is completely unchanged.
   Warnings only appear when relevant. Matches spec: "Normal use must require no
   additional step or decision."
5. **Matches Mailchimp/SendGrid** — they don't block selection, they explain and
   block the final action

---

### What NOT to Do

- Do NOT disable the contact checkbox — user needs to select to see the exclusion
  (spec §4.1: "Keep excluded contacts selected so users can understand the difference
  between selection and planned recipients")
- Do NOT auto-cancel existing campaigns — too destructive, user must do explicitly
- Do NOT add a "force send" button — bypasses dedup protection, violates spec §3.2
- Do NOT show a modal/dialog — inline warning with actions is less disruptive
- Do NOT add new API endpoints — all data is already available from pre-check response

---

### Files to Modify

1. `components/campaigns/CampaignWizard.tsx` — all 4 changes
2. `components/ui/Badge.tsx` — add optional `title` prop for tooltips (if not already supported)
3. `tests/unit/components/campaigns/CampaignWizard.test.tsx` — new tests for:
   - Zero-eligible warning appears
   - Continue disabled at zero eligible
   - "Choose follow-ups" button in warning when SENT contacts exist
   - Badge tooltips present
   - Schedule/Review warning at zero eligible

### Verification

- `npx vitest run tests/unit/components/campaigns/` — all tests pass
- `npx tsc --noEmit` — typecheck clean
- `npm run lint` — 0 errors
- `npm run build` — succeeds
- `npm run build:worker` — succeeds
