# Campaign duplicate prevention and recipient awareness

Status: implementation-ready specification with mandatory production release gates. Reviewed against the repository and user edits on 2026-09-13. Database: Neon PostgreSQL. Production certification requires implemented code, verified migrations, and the tests below.

## 1. Outcome

Users must understand who will receive an email while choosing contacts, before clicking the final scheduling button. Duplicate protection is enabled by default. The backend must independently enforce the same rules under concurrent requests, double-clicks, network retries, and stale previews.

Normal use must require no additional step or decision: select contacts, see the effective recipient count, and schedule. Keep the existing five-step wizard. Show a compact summary by default, reveal explanations on demand, and present exception controls only when relevant. Backend validation remains mandatory regardless of whether the user opens the details.

Keep three capabilities: safe campaign creation, immediate recipient awareness, and contact email history. Implement the backend and immediate UI together before releasing duplicate prevention. History may ship separately.

## 2. Verified current system

| Area | Current implementation | Consequence |
| --- | --- | --- |
| Database | `lib/db/index.ts` and `lib/db/prisma.ts` use `PrismaNeon`; installed adapter implements interactive transactions using a checked-out connection and `BEGIN`. | Use the existing adapter and transaction client; no database replacement is needed. |
| Versions | `package.json` declares Prisma/client 7.10 and adapter-neon ^6.7. | Verify the installed combination in real Neon transaction tests before rollout; do not infer compatibility from mocked tests or change versions incidentally. |
| Creation | `app/api/campaigns/route.ts` creates an ACTIVE campaign, then separately calls `generateCampaignJobs`. | A failure can leave an empty campaign; a repeated POST creates another campaign ID. |
| Job generation | `lib/jobs/scheduler.ts` reads contacts/template, renders snapshots, and calls `createMany`. No explicit contact order or duplicate guard. | Refactor to consume one validated snapshot and deterministic recipient order inside the creation transaction. |
| Worker | `worker/index.ts` schedules persisted jobs and uses `lib/jobs/consumer.ts`. Retries update existing job rows. | Keep transport, quota reservations, and retry behavior intact. |
| Unknown delivery | Worker recovery uses DELIVERY_UNKNOWN; admin recovery resolves it to SENT or FAILED. | Never silently resend an unresolved job. |
| Wizard | `CampaignWizard.tsx` has Campaign, Content, Contacts, Schedule, Review steps. Pre-check runs only after final submit is clicked; missing-value dialog actions submit directly. | Replace this late discovery flow with live eligibility and explicit inline choices. |
| Options | `/api/campaigns/options` returns all owned contacts and active sender choices, without duplicate history. | Add bounded eligibility reads for the visible contact page and selected contacts. Avoid loading all historical jobs. |
| Schema | Contact email is indexed but not unique; templates can be edited in place. Jobs snapshot subject, body, recipient address, and HTML. | Deduplicate recipient addresses, and call the historical rule template reuse rather than exact-content equality. |
| History | EmailLog stores sending outcomes/errors; no open/click collection was found. | Show sending history, not invented engagement data. |
| Responses | `respondOk`, `respondList`, and `respondError` define common envelopes. Error serialization currently preserves fields/retry metadata, not arbitrary structured details. | Extend typed error details deliberately for refreshed eligibility; update client types too. |

Only one production job-creation site was found: `emailJob.createMany` in the scheduler helper, called by campaign POST. `/api/emails` currently lists jobs. Any future creation/import/resend path must use the same creation service and locking protocol.

### 2.1 Integration boundaries confirmed on 2026-09-13

- Keep `defineRoute`: it already resolves async params, verifies users, checks same-origin cookie requests, and applies configured rate limits. New endpoints must not bypass these protections. Its ownership mode allows admins; contact history in this feature instead uses `auth: 'user'` and explicit current-user scoping, matching the contacts list.
- Keep `respondOk`/`respondList` envelopes and public `error.type`. Add typed operational `error.details` and preserve `error.fields`/`retryAfter`; pass the route's request ID consistently through serialization and headers. Do not change all consumers to `error.code`.
- Keep the existing custom `Select` for form choices. `Dropdown` is an action menu, not a replacement for the wizard's value-based selector. Use existing labeled checkboxes for follow-ups.
- Change campaign POST's current missing-value branch: it presently rejects an unfiltered selection even with `exclude`. The new shared service must accept the full selection and calculate exclusions itself. Remove that old rejection path when integrating; retain validation against the actual rendered subject/text/HTML.
- Preserve `campaignEmailTime` and the current 24-hour batch rules. Resolve contact fields with `buildTemplateContact`/`replaceTemplateVariables`; retain text fallback `body_text ?? body` and optional `body_html`. No new email renderer is required.
- `SchedulePreview` displays timings; `CampaignWizard` owns the final button. Both must consume effective count. `CampaignsPage.createCampaign` currently returns no structured result and closes on success; add the typed result contract for preview conflicts and same-key recovery there.
- Keep legacy `attachment_id` request support with the existing mutual-exclusion rule; normalize it to an attachment ID array for preview/hash comparison. The current wizard sends `attachment_ids`. Validate against existing provider-specific count/size limits and `deleted_at`, not only the global maximum of 10.
- Read-only contact/status endpoints do not expose rendered email bodies or credentials. The contact picker should reuse `/api/contacts` response mapping and add an ID tie-breaker to its existing created-at ordering for deterministic pagination. Preserve the other contacts-page consumers.

All new services, columns, endpoints, and controls below are proposed changes. They are not claims that these protections already exist. No transport, quota accounting, recovery, or retry rewrite is in scope.

## 3. Product policy: predictable and conservative

### 3.1 Historical match

Use `(user_id, normalized recipient email, template_id, email_account_id)` across all retained email jobs, including jobs with no campaign.

For this feature, the authoritative normalization is PostgreSQL `lower(btrim(address))` under the database collation. This trims ordinary spaces, not every Unicode whitespace character. Return normalized contact and submitted follow-up addresses from a bounded database query; use those keys throughout eligibility, hashing, and job creation. Do not independently rely on JavaScript Unicode lowercasing for authoritative keys. This is an intentional product policy treating case variants as one recipient, not a claim that every mail server does so. Do not remove Gmail dots, strip plus tags, or merge provider aliases. Verify non-ASCII cases. Preserve original `to_email` for display and sending.

Match history against the job's stored `to_email`, not the contact's current email. Editing a contact to a new address must not suppress the new address because its old address received a message. Two different contact records for the same address must not receive two jobs in one campaign.

The rule covers reuse of a template from an account for the entire retained history. Changing template text or attachments does not reset that history. A copied template or another sender account is a different match. Explain this in expanded details beside the resend choice: "Checks previous emails using this template and sending account, including earlier versions of the template."

Do not label this "the exact same email." Content fingerprint deduplication, template revision history, and cross-account matching are deferred product features. A preview digest below verifies freshness; it is not a content-deduplication rule.

Distinguish three protections: duplicate addresses within a campaign are collapsed automatically; repeated submissions are handled invisibly with idempotency; historical template reuse is this app's conservative, overridable product policy. Reusing an edited template can be legitimate. Label that reason "Previously emailed using this template" and keep the relevant override easy to find. Do not describe lifetime template suppression as a universal industry standard.

### 3.2 Status decisions

| Existing matching job | Default: skip previous sends | Explicit follow-up selected for this recipient |
| --- | --- | --- |
| SENT | Exclude | Include only if no pending or unknown matching job exists |
| SCHEDULED, QUEUED, PROCESSING, RETRY_WAIT | Exclude | Still exclude |
| DELIVERY_UNKNOWN | Exclude; needs review | Still exclude; use existing admin recovery |
| FAILED, CANCELLED only | Eligible | Eligible |
| No matching history | Eligible | Eligible |

Inspect all matching rows, not merely the latest one. For a single display reason use precedence: unknown delivery, pending, sent, eligible. A more recent failed row does not erase an earlier successful send. A paused campaign's pending jobs remain excluded because they may resume. Do not decide eligibility from campaign status alone.

Historical resend permission is an explicit set of selected recipients, not a campaign-wide boolean. A SENT recipient is included only when their selected representative contact and current recipient address are in that set. All other previously sent recipients remain excluded. The UI calls this "Choose contacts to follow up with." It does not bypass pending jobs, unknown delivery, same-address selection collapse, ownership, or idempotency. Intentional resends create a new campaign; no new same-campaign send-attempt model is introduced. Worker retries retain their existing job ID.

### 3.2.1 Required HR follow-up example

The user previously emailed 100 HR contacts. They now select those 100 plus 50 new contacts. With no follow-up choices, schedule only the 50 new recipients and exclude the 100 previously contacted recipients. In the previously contacted list, the user chooses 20 specific contacts for follow-up:

| Selected group | Scheduled | Excluded |
| --- | --- | --- |
| 50 new contacts | 50 | 0 |
| 20 previously contacted HRs explicitly chosen for follow-up | 20 | 0 |
| Other 80 previously contacted HRs | 0 | 80 |
| Total | 70 | 80 |

Show "70 emails will be scheduled" and "50 new recipients + 20 follow-ups · 80 excluded." The primary action is "Schedule 70 emails." These numbers assume no pending/unknown deliveries or missing-value exclusions. Other protections still apply and must reduce the count with an explanation when needed.

The simpler workflow also works: select only the desired 20 previous contacts and the 50 new contacts, then choose those 20 for follow-up. Both workflows produce the same 70 recipients. It must not be necessary to manually deselect the other 80 when all 150 are already selected.

### 3.3 Duplicate selected contacts and missing values

Keep the original selected contact IDs for editing; derive eligible recipients server-side.

1. Reject repeated IDs and foreign/missing IDs with useful validation; cap selection at 1,000 contacts for this release.
2. Group selected contacts by normalized address. Choose the first selected record as the personalization source, preserving submitted order. Show other records as "Same address selected twice" with the chosen contact's name. Users can deselect the chosen record to use another. Never silently switch to a record with more complete values.
3. Apply the status policy to each chosen address.
4. Check required template values on the remaining candidates, across subject, text, and HTML snapshots. Default to excluding contacts with missing values. Permit the existing deliberate "Send with missing values" behavior with an inline warning about unresolved placeholders. Unknown tokens require fixing the template or an explicit continue choice; excluding contacts cannot fix an unknown token.
5. Produce one primary exclusion reason per selected record. Secondary reasons may appear in expanded detail, but totals must not double-count them.

Invariant: selected contact count = scheduled recipient count + same-address extras + history exclusions + missing-value exclusions. Unknown-token blocking is a separate campaign-level condition. Schedule calculations use the final recipient count and ordering. Zero eligible recipients cannot create a campaign.

## 4. UI: visible before any submit

### 4.1 Contacts step

When sender and template are known, check currently visible contacts even before selection. Show small text badges only on affected rows; ordinary eligible contacts need no green badge or success explanation. Selecting contacts immediately triggers the selection summary. No warning depends on clicking Next or Schedule.

Use one compact summary above the contact list. Avoid repeating a full summary near the footer when it is already visible:

> **18 emails will be scheduled**
>
> 12 contacts excluded to avoid repeat sends. **View details**

This example assumes all exclusions concern repeat sends. For mixed reasons, use "12 contacts excluded. View details"; do not describe missing personalization as duplicate prevention. If there are no exclusions, show only "30 emails will be scheduled." Do not display an empty breakdown or irrelevant controls.

"View details" expands in place to show selected count, excluded count by reason, affected contacts, and the matching-policy explanation. Opening details is optional; never require acknowledging every exclusion. Keep the details expanded while users interact with their controls. A compact footer count is useful only when the main summary has scrolled out of view.

Use "Sent" rather than "Received": provider acceptance is not evidence of inbox delivery. Pending rows should say "Already scheduled" or "Sending in progress." Unknown rows should say "Delivery needs review — this email may already have been sent."

Keep contact names and addresses visible. Put last-sent/scheduled dates and longer explanations in expanded details. Keep excluded contacts selected so users can understand the difference between selection and planned recipients. Provide an excluded-contact view and contact-history links inside details. Automatically collapse duplicate selected addresses without requiring users to clean the contact database first.

When selected contacts have previous SENT history, show a contextual "Choose follow-ups" link beside "View details"; no follow-up controls appear in the ordinary all-new-recipient flow. The link opens the previously contacted section in place, with a searchable list of the selected previous recipients, last-sent date, and an unchecked checkbox per recipient labeled "Send again." The user can choose exactly 20 of 100 without changing the main contact selection. Retain checked choices across search and pagination; show "20 selected for follow-up" above the list.

Pending or unknown matching deliveries cannot be checked and have a visible explanation. Missing-value exclusions still apply; show their reason rather than implying a follow-up selection guarantees sending. Add accurately scoped "Select this page for follow-up" and "Clear follow-ups" actions. Never implement a persistent "include all previous recipients" mode that automatically authorizes contacts added later. Bulk actions only add the explicitly displayed, currently selectable recipients to the set.

Keep existing follow-up selections visible and removable even if a refresh makes them ineligible. Deselecting a contact from the main selection removes their follow-up permission; reselecting does not restore it automatically. Changing sender/template clears follow-up choices with a short inline notice. A changed recipient address or personalization representative requires selecting the new recipient again; do not transfer consent to another address or duplicate record silently.

Every change updates eligibility before scheduling is enabled. The compact summary says, for example, "70 emails will be scheduled" and "50 new recipients + 20 follow-ups · 80 excluded." Keep the reason breakdown in details. There is one primary scheduling action, not two competing send buttons. New means no matching retained SENT history for this template/account, not necessarily a newly created contact.

Show missing-value choices only when missing values exist, inside the relevant details section; safe automatic exclusion needs no extra acknowledgment. A blocking unknown-token issue must be visible without opening details, with an inline fix/continue choice. Remove the direct-submit behavior from `confirmExclude` and `confirmContinue`; changing either choice only refreshes eligibility. A user always reaches a clear final review before creation.

### 4.2 Schedule and Review steps

Persist only the compact count and optional "View details" through both steps; keep full breakdowns collapsed by default. Feed eligible count into `SchedulePreview`, single-recipient behavior, review text, and final button label: "Schedule 18 emails" / "Schedule 1 email". Preserve hidden multi-recipient pace inputs when eligibility becomes one recipient, matching `CAMPAIGN_SCHEDULING.md`.

Review shows the effective sender, template, attachment names, start time/timezone, planned recipient count, and compact excluded count. Show enabled resend/missing-value choices as short explanations of what will happen, not another required confirmation. Reasons remain available on demand. Planned times use `campaignEmailTime`; delivery may be delayed by worker cadence, limits, or retries.

Before valid sender/template/contact choices exist, show an instructional empty state. At zero eligible recipients, show why and offer the relevant edit action; disable scheduling. Unknown tokens without an explicit choice also disable it.

### 4.3 Loading, failures, stale state, and accessibility

- Debounce selection changes (contact IDs, resend recipients, missing-value/unknown-token action) by 250 ms. Sender, template, and attachment changes trigger an immediate check (not debounced) because they change the policy scope entirely. Abort obsolete requests and also check a monotonically increasing request ID; an old response must never replace newer selection state.
- Track `idle`, `checking`, `ready`, `stale`, and `error`. Immediately mark old counts stale when inputs change. Keep them visibly labeled "Updating…" if retained; do not show stale counts as current.
- Refresh on sender, template, attachment, selected-contact/order, resend, and missing-value changes. Refresh when the page becomes visible again and every 30 seconds while the wizard is visible with a selection. Final creation still recomputes eligibility. Separate background refresh from input invalidation: an unchanged-input refresh may retain a ready preview for up to 60 seconds from its last successful check (two nominal polling intervals; delayed requests can still expire), with a subtle updating indicator and no button flicker. Expired previews become stale; an actual refresh failure enters error.
- Scheduling is disabled while initial/input-dependent checking, stale, failed, submitting, or globally blocked. During an unchanged-input background refresh, a still-fresh ready preview can remain actionable because POST independently validates it. Freeze the submitted payload/fingerprint/key when clicked; a late refresh must not mutate an in-flight attempt. A failed read says "Could not check recipients. Try again." It never becomes a zero-duplicate success.
- Announce the settled summary using `aria-live="polite"`; avoid announcements for every keystroke. Statuses require text, not color alone. All choices are keyboard accessible and have labels; move focus to actionable errors after a conflict.
- On small screens, use stacked summary rows and a footer that does not cover list controls. Reuse `Button`, `Badge`/`StatusBadge`, `Alert`, `Pagination`, the existing custom `Select` for form values, `Dropdown` for action menus, `SearchInput`, `LoadingSpinner`, `EmptyState`, and `ErrorState`. Do not replace current custom form selectors or create parallel UI primitives.
- Normal use requires no surprise dialog after pressing Schedule. A rare material concurrent change produces an inline refreshed summary and requires another explicit click; never silently schedule a materially different recipient set or message. Background changes that leave the planned send and consent requirements unchanged update details without asking the user to confirm again.

### 4.4 Contact loading bounds

The current options endpoint loads every contact. Preserve account/template/attachment options, but move the wizard contact picker to paginated `/api/contacts` reads using its existing search/pagination conventions, page size 50 and maximum 100. Preserve selected IDs across pages and search changes. Label bulk selection "Select this page"; do not imply all contacts are selected when only one page is loaded. Validate/enforce the 1,000-selection cap in both UI and API.

Use a separate read-only POST `/api/campaigns/recipient-status` for at most 100 visible contact IDs plus sender/template IDs. It returns historical classifications for row badges, not an authoritative selection count. The selected-contact pre-check remains the single source for summary and creation. Both endpoints call the same policy code; avoid one query per row. This keeps immediate visibility without fetching all historical data or all contact records.

## 5. API contract and shared calculation

### 5.1 Shared service

Create `lib/campaigns/eligibility.ts` with explicit policy types and set-based history queries; create `lib/campaigns/create.ts` for transactional creation. Refactor missing-value logic to work from loaded snapshots and a transaction-compatible database interface. `lib/db/index.ts` already exports `TransactionClient`; do not cast a transaction to the full PrismaClient.

Current signatures that must change:

- `generateCampaignJobs(prisma: PrismaClient, campaign: {...}, contactIds: string[])` in `lib/jobs/scheduler.ts` → change first parameter to accept `TransactionClient` (the transaction client is a subset of `PrismaClient` with the same model delegates). The campaign object and `contactIds` are replaced by a prepared snapshot from the eligibility service.
- `runMissingValueCheck(prisma: PrismaClient, userId, subject, body, contactIds)` in `lib/campaigns/missing-values.ts` → separate data loading from the pure snapshot calculation. Load authoritative creation snapshots after acquiring the lock inside the transaction; outside-transaction reads are advisory only.

Eligibility computation returns both a safe public summary and an internal prepared snapshot. Job generation consumes that snapshot; it must not re-read a newer template/contact version after the eligibility decision. Use the saved rendered template, resolve merge values once, and preserve deterministic order. The fingerprint represents the effective planned send and meaningful choices, not every underlying history change.

### 5.2 Extended POST `/api/campaigns/pre-check`

Retain existing camelCase request names and missing-value result fields while extending them:

```text
Request:
  templateId, emailAccountId
  contactIds: ordered UUID[] (1..1000, unique)
  attachmentIds: UUID[] (existing provider limits)
  resendRecipients: [{ contactId: UUID, recipientEmail: string }] (default [], max 1000)
  missingValueAction: "exclude" | "continue" (default exclude)
  unknownTokenAction: "fix" | "continue" (default fix)

data:
  existing missingValues, unknownTokens, affectedContactCount, totalContactCount
  policyVersion: 1
  checkedAt
  previewFingerprint
  selectedCount, eligibleCount, excludedCount
  excludedByReason: { duplicateAddress, previouslySent, pending, deliveryUnknown, missingValues }
  includedPreviousCount
  includedWithoutPreviousSendCount
  blockedByUnknownTokens: boolean
  recipients: [{ contactId, included, followUpSelected, canSelectFollowUp,
                 primaryReason, representativeContactId?,
                 lastSentAt?, pendingScheduledAt? }]
```

`primaryReason` enum values (exactly one per excluded recipient; `null` for included recipients):

| Value | Meaning |
| --- | --- |
| `null` | Recipient is included (scheduled). |
| `DUPLICATE_ADDRESS` | Another selected contact with the same normalized address was chosen as the representative. |
| `PREVIOUSLY_SENT` | Has SENT history for this template/account and was not explicitly chosen for follow-up. |
| `PENDING` | Has an in-flight matching job (SCHEDULED, QUEUED, PROCESSING, RETRY_WAIT). Follow-up cannot override. |
| `DELIVERY_UNKNOWN` | Has a DELIVERY_UNKNOWN matching job. Follow-up cannot override; needs admin recovery. |
| `MISSING_VALUES` | Required template merge tag has no value for this contact and `missingValueAction` is `exclude`. |

First classify non-representative selected records as `DUPLICATE_ADDRESS`. For representatives apply `DELIVERY_UNKNOWN` > `PENDING` > `PREVIOUSLY_SENT` (unless authorized) > `MISSING_VALUES` (when exclusion is chosen). Included representatives use null. This follows grouping in §3.3 and unknown-before-pending precedence in §3.2; each selected record contributes to exactly one count.

Validate ownership of sender, template, attachments, and all contacts on every request. Validate active sender and provider/attachment compatibility in preview and creation. Query jobs with explicit `user_id` scope even when UUIDs appear globally unique. Return `private, no-store`; no cross-user caches. Return selected-record metadata only, not email bodies, SMTP responses, or all matching job rows. Bound bodies at 1 MiB, allowing 1,000 maximum-length follow-up addresses; count actual streamed bytes before JSON parsing, not only Content-Length. Overflow returns 413; malformed JSON returns 400. Apply the explicit rate budgets in §5.8.

Validate `resendRecipients` as a unique subset of the main selected representative contacts. Each supplied address must normalize to that contact's current address. Reject foreign, unselected, duplicate, non-representative, or address-mismatched entries; do not silently expand or retarget the set. The server derives history and status eligibility itself. An entry never overrides a pending/unknown job or missing-value policy. If a valid selected entry no longer has SENT history, it grants no additional eligibility and is not counted as a follow-up; refresh the explanation. Return enough recipient metadata to display current follow-up selection separately from actual inclusion. No wildcard, all flag, or client-supplied historical status is accepted.

Generate `previewFingerprint` as a server-side SHA-256 digest over a versioned canonical representation of the ordered selection, sender/template identity, explicit policy choices, canonically sorted normalized resend recipient pairs, ordered eligible contact/address pairs and personalization sources, their prepared subject/text/HTML content, material attachment identity/version, campaign-level blockers, and meaningful consent facts such as which included recipients are previous recipients. Include actual effective values, not arbitrary source modification timestamps. Ownership and all eligibility rules are always checked independently; the digest is a freshness mechanism, not authorization. Pre-check reads should use a short repeatable-read transaction for a consistent multi-query view, without taking the creation lock.

Exclude incidental history statuses, last-sent dates, exclusion-reason labels, the current clock, and job `updated_at` from the fingerprint when they do not affect the planned send. For example, SCHEDULED becoming QUEUED, or a default-excluded pending job becoming SENT, should refresh details without forcing reconfirmation if the same recipients remain excluded. By contrast, a recipient becoming eligible, an included recipient becoming pending/unknown, changing the personalization source or effective message/attachments, or changing whether an included recipient needs resend consent is material. Compare recipient identities and message values, not merely counts: replacing one recipient with another must conflict even when the count stays 18. Recompute all backend validations on every POST, including when the fingerprint matches.

### 5.3 POST `/api/campaigns`

Retain existing snake_case creation fields. Add mandatory `idempotency_key` (UUID), `preview_fingerprint`, `resend_recipients: [{ contact_id, recipient_email }]` (default []), and policy fields `missing_value_action`, `unknown_token_action`. Translate these to the shared pre-check types without changing semantics. Server defaults remain conservative; missing preview/key receives a clear validation error and performs no writes. This explicit recipient set replaces the earlier proposed `duplicate_action` / `skip_already_sent` boolean design; reject those unsupported fields rather than silently interpreting them. Omitted resend recipients means no historical resends, never "send everyone."

Return the existing campaign row shape plus final `recipient_summary`, `replayed`, and accurate `_count.email_jobs` read after insertion. First creation returns 201; a replay returns 200 and the same campaign identity/original recipient summary.

Define typed errors in `lib/errors/error-codes.ts` and the shared error envelope. Add the following new codes to the existing `ERROR_CODES` const alongside the current `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`, etc. Each new code gets a dedicated `AppError` subclass in `lib/errors/index.ts` following the existing pattern (`constructor(message, details?) → super(message, httpStatus, code, true, details)`):

| Status | `error.type` | `AppError` subclass | Meaning / UI |
| --- | --- | --- | --- |
| 409 | `RECIPIENT_PREVIEW_CHANGED` | `RecipientPreviewChangedError` | Material planned-send/consent change; no writes. Include the refreshed public pre-check in `details.preCheck`; update the inline summary and require review. Incidental status changes alone do not trigger this. |
| 409 | `IDEMPOTENCY_KEY_REUSED` | `IdempotencyKeyReusedError` | Same key with a different canonical creation payload. Do not create another campaign. |
| 503 | `CAMPAIGN_CREATION_BUSY` | `CampaignCreationBusyError` | Lock/connection/transaction contention exceeded budget. Map `details.retryAfterSeconds` to `error.retryAfter` and Retry-After. Preserve the submission key. |
| 422 | `NO_ELIGIBLE_RECIPIENTS` | `NoEligibleRecipientsError` | No campaign/jobs; return eligibility detail in `details.eligibility`. |
| 422 | `RECIPIENT_ACTION_REQUIRED` | `RecipientActionRequiredError` | Unknown placeholders or invalid explicit choice require user action. Include `details.unknownTokens` and/or `details.missingValues`. |
| 422 | `UNSUPPORTED_FIELD` | `UnsupportedFieldError` | Request contains `duplicate_action`, `skip_already_sent`, or another removed field. Include `details.fields` listing the rejected field names. Do not silently interpret them. |
| 422 | `RESEND_ENTRY_INVALID` | `ResendEntryInvalidError` | An owned entry is unselected, duplicate, non-representative, or address-mismatched. Include input index/reason only. Foreign or nonexistent references receive generic 403 without owner/address disclosure. |
| 429 | `RATE_LIMITED` (existing) | `RateLimitError` (existing) | Pre-check rate budget exceeded. Include `retryAfter`. |
| 403 | `AUTHORIZATION_ERROR` (existing) | `ForbiddenError` (existing) | Sender, template, attachment, or contact not owned by the authenticated user. |
| 400 | `VALIDATION_ERROR` (existing) | `ValidationError` (existing) | Malformed UUID/JSON, missing or invalid fingerprint/key, contact cap exceeded, or other schema validation failure. Include `details.fields` for per-field errors. |
| 413 | `PAYLOAD_TOO_LARGE` | `PayloadTooLargeError` | Request body exceeds 1 MiB; stop reading without parsing or processing it. |

Map new codes in `APP_ERROR_CODE_MAP` only if internal codes differ from public `error.type`. Handle creation-related `P2002` in the asynchronous creation service after rollback: query the receipt by user/key, compare its request hash, and replay only an exact match. Leave shared synchronous `fromPrismaError` free of database lookups. A uniqueness conflict with no matching receipt is an integrity error, never successful creation.

Extend `ApiErrorResponse`, serialization, campaign page Envelope, and wizard submission result types together. The parent `createCampaign` handler must return structured success/conflict/error information to the wizard; a toast alone cannot update stale recipient state. Do not silently drop structured details as the current serializer would.

### 5.4 POST `/api/campaigns/recipient-status`

Read-only endpoint for row-level badges on visible contacts. Not an authoritative selection count — the pre-check endpoint (§5.2) is the single source for summary and creation.

Follow the existing route pattern: `defineRoute(async (req, ctx) => { ... }, { auth: 'user', rateLimitKey: 'campaign-pre-check' })` with `respondOk`/`respondError` from `@/lib/api/respond`. Use the same `uuid` and `email` helpers from `@/lib/validation/common`.

```text
Request:
  templateId: UUID
  emailAccountId: UUID
  contactIds: UUID[] (1..100, unique)

Response data:
  policyVersion: 1
  statuses: [{ contactId, classification, lastSentAt?, pendingScheduledAt? }]
```

`classification` enum: `ELIGIBLE` | `PREVIOUSLY_SENT` | `PENDING` | `DELIVERY_UNKNOWN`. Unlike `primaryReason`, this uses ELIGIBLE rather than null and omits selection-dependent duplicate-address/missing-value reasons. Unknown delivery precedes pending, then previously sent.

Validate ownership of sender, template, and all contacts. Reject more than 100 contact IDs with `ValidationError`. Return `private, no-store`. Call the same policy code as pre-check; do not run one query per contact. Rate-limit identically to pre-check.

### 5.5 GET `/api/campaigns/submissions/[key]`

Required authenticated lookup for durable submission recovery after a lost response.

Follow `defineRoute` with `auth: 'user'` and `rateLimitKey: 'campaign-submission-status'`. Read the validated UUID from `ctx.params.key`; query by both user ID and key. This deliberately provides owner-scoped lookup without the ownership wrapper's admin bypass. Return via `respondOk`/`respondError`.

```text
Path param: key (UUID — the idempotency_key)

Response data (200):
  campaignId: UUID
  campaignName: string
  recipientSummary: object (stored at creation time)
  createdAt: ISO 8601 timestamp

Response (404):
  Not found. This means no committed submission exists for this key yet.
  It is not proof that no request is in flight.
```

Return `private, no-store`. Do not return `request_hash`, `resend_recipients`, or email content. This endpoint is for browser recovery only, not a public status API.

### 5.6 Field name mapping: pre-check (camelCase) ↔ creation (snake_case)

The pre-check endpoint (§5.2) uses camelCase to match existing wizard client code. The creation endpoint (§5.3) uses snake_case to match the existing `createCampaignSchema` and Prisma column conventions. The shared service translates between them without changing semantics:

| Pre-check (camelCase) | Creation (snake_case) | Shared service type |
| --- | --- | --- |
| `templateId` | `template_id` | `templateId: UUID` |
| `emailAccountId` | `email_account_id` | `emailAccountId: UUID` |
| `contactIds` | `contact_ids` | `contactIds: UUID[]` |
| `attachmentIds` | `attachment_ids` | `attachmentIds: UUID[]` |
| `resendRecipients` | `resend_recipients` | `resendRecipients: ResendEntry[]` |
| `missingValueAction` | `missing_value_action` | `missingValueAction: 'exclude' \| 'continue'` |
| `unknownTokenAction` | `unknown_token_action` | `unknownTokenAction: 'fix' \| 'continue'` |
| `previewFingerprint` | `preview_fingerprint` | `previewFingerprint: string` |
| — (not sent) | `idempotency_key` | `idempotencyKey: UUID` |

`ResendEntry` type: `{ contactId: UUID, recipientEmail: string }` (camelCase) / `{ contact_id: UUID, recipient_email: string }` (snake_case). The `recipient_email` must normalize (trim + lowercase) to the contact's current email address; the server validates this.

### 5.7 Zod validation schemas

Extend the existing `lib/validation/campaign.ts` schemas. All schemas use the existing `uuid` and `nonEmptyString` helpers from `lib/validation/common.ts`.

```typescript
// Shared sub-schemas — reuse existing helpers from lib/validation/common.ts
// uuid = z.string().uuid()
// email = z.string().email().max(255)
// nonEmptyString = z.string().min(1)
// MAX_CAMPAIGN_ATTACHMENTS = 10 (from lib/email/attachment-limits.ts)
const resendEntrySchema = z.object({
  contact_id: uuid,
  recipient_email: email,
}).strict();

// Pre-check request (camelCase — matches existing pre-check convention)
const preCheckSchema = z.object({
  templateId: uuid,
  emailAccountId: uuid,
  contactIds: z.array(uuid).min(1).max(1000).refine(ids => new Set(ids).size === ids.length, 'Duplicate contact IDs are not allowed.'),
  attachmentIds: z.array(uuid).max(MAX_CAMPAIGN_ATTACHMENTS).refine(ids => new Set(ids).size === ids.length, 'Choose each attachment only once.').default([]),
  resendRecipients: z.array(z.object({
    contactId: uuid,
    recipientEmail: email,
  }).strict()).max(1000).default([]),
  missingValueAction: z.enum(['exclude', 'continue']).default('exclude'),
  unknownTokenAction: z.enum(['fix', 'continue']).default('fix'),
}).strict();

// Campaign creation request (snake_case — extends existing createCampaignSchema)
const createCampaignSchema = z.object({
  name: nonEmptyString.max(255),
  email_account_id: uuid,
  template_id: uuid,
  attachment_id: uuid.optional(),
  attachment_ids: z.array(uuid).max(MAX_CAMPAIGN_ATTACHMENTS).refine(ids => new Set(ids).size === ids.length, 'Choose each attachment only once.').optional(),
  start_at: z.coerce.date(),
  timezone: z.string().trim().max(64).refine(isValidTimezone, 'Choose a valid IANA timezone.').default('UTC'),
  interval_minutes: z.coerce.number().int().positive().default(5),
  daily_limit: z.coerce.number().int().positive().nullable().optional(),
  contact_ids: z.array(uuid).min(1).max(1000).refine(ids => new Set(ids).size === ids.length, 'Choose each contact only once.'),
  idempotency_key: uuid,
  preview_fingerprint: z.string().regex(/^[0-9a-f]{64}$/, 'Invalid preview fingerprint.'),
  resend_recipients: z.array(resendEntrySchema).max(1000).default([]),
  missing_value_action: z.enum(['exclude', 'continue']).default('exclude'),
  unknown_token_action: z.enum(['fix', 'continue']).default('fix'),
}).strict().refine(data => !(data.attachment_id && data.attachment_ids !== undefined), { message: 'Use attachment_ids only.', path: ['attachment_ids'] })
  .refine(data => data.resend_recipients.length <= data.contact_ids.length, { message: 'Follow-up recipients must be a subset of selected contacts.', path: ['resend_recipients'] });

// Recipient-status request (camelCase — matches pre-check convention, NOT creation convention)
const recipientStatusSchema = z.object({
  templateId: uuid,
  emailAccountId: uuid,
  contactIds: z.array(uuid).min(1).max(100).refine(ids => new Set(ids).size === ids.length, 'Duplicate contact IDs are not allowed.'),
}).strict();
```

The `.max(1000)` contact cap and `.max(100)` recipient-status cap are the authoritative limits. The UI must enforce the same caps client-side and disable selection beyond 1,000. The `resend_recipients` subset refinement is a structural check only; the server still validates ownership, representativeness, and address normalization separately in the shared service.

Keep existing imports for `z`, `isValidTimezone`, `MAX_CAMPAIGN_ATTACHMENTS`, `uuid`, and `nonEmptyString`; add the existing `email` helper. Schema examples above replace the current creation definition, not its already-refined ZodEffects via `.extend()`. Map Zod `unrecognized_keys` issues (including nested objects) to 422 `UNSUPPORTED_FIELD`; other shape errors use 400. Validate follow-up uniqueness and actual ID subset membership in a shared structural helper for both request naming conventions; a length comparison alone is insufficient. Normalize UUIDs to lowercase before uniqueness/hash comparisons so case variants cannot bypass checks.

### 5.8 Operational contracts and preview details

Register exact route keys in `RATE_LIMITS`: `campaign-pre-check` at 120/60 seconds (shared by selected pre-check and row-status), `campaign-create` at 10/60 seconds, and `campaign-submission-status` at 60/60 seconds. Creation currently uses the hyphenated key while the configured rule uses `campaigns:create`; fix the key mismatch rather than falling through to the default. Debounce/cancel reads and honor Retry-After. The existing in-memory store is process-local; a Cloudflare binding ignores numeric per-route arguments. Verify the actual API runtime's limiter configuration and document its scope before rollout; do not claim a global rate budget merely because these constants exist. Database locking/idempotency remain independent of rate limiting.

Use `{ success: false, error: { type, message, requestId, fields?, retryAfter?, details? } }`. Add allow-listed details only for known operational errors. `details.preCheck` and `details.eligibility` contain the public pre-check type. `details.entries` uses `{ index: number, reason: 'UNSELECTED' | 'DUPLICATE' | 'NON_REPRESENTATIVE' | 'ADDRESS_CHANGED' }[]`. Unknown keys use `details.fields: string[]`; field validation uses existing `error.fields: Record<string,string>`. Do not cast the string array into `error.fields` or expose arbitrary database exception metadata. Apply no-store to errors as well as successes.

Public recipient rows also return `name: string | null`, `recipientEmail: string`, and `hasPreviousSend: boolean` for each owned selected record. This lets the follow-up list render/search contacts across pages without one GET per contact. `followUpSelected` reflects the explicit choice even when blocked; `canSelectFollowUp` is true only for a representative with SENT history and no pending/unknown match. Missing-value policy can still exclude that choice. Existing checked entries remain removable even when canSelectFollowUp becomes false. The selected list is bounded at 1,000; paginate/search its returned metadata locally. Row-status results never overwrite authoritative selection counts.

`eligibleCount` means recipients after exclusions, before campaign-wide unknown-token blocking; when `blockedByUnknownTokens` is true, show an action-required message rather than implying scheduling is enabled. Creation never proceeds while blocked. Missing-value result arrays describe unique selected representatives, including previous recipients that could be followed up with; excludedByReason counts follow the actual policy order. The receipt's `recipient_summary` stores policyVersion, selectedCount, eligibleCount, excludedCount, excludedByReason, includedPreviousCount, and includedWithoutPreviousSendCount from the accepted result, not rendered content or the whole pre-check.

All fingerprints/hashes use SHA-256 lowercase 64-character hex over UTF-8 canonical JSON: explicitly ordered object keys, preserved contact/attachment order, sorted follow-up pairs, UTC ISO dates, material nulls retained, and omitted optional values normalized to their defaults. Do not include idempotency_key itself in request_hash. Include the set of matching SENT job IDs for each explicitly chosen follow-up in the material preview fingerprint: a new completed send to that recipient after preview needs renewed review, even if eligibility/count otherwise look unchanged. Exclude incidental timestamp/status updates that add no new SENT job or eligibility change. This prevents an old follow-up preview being reused after another campaign sends and completes. No field edits or changing the receipt key bypass that check.

On material preview mismatch return 409 before writing. With a matching preview, unknown-token blocking returns 422 action-required; then zero eligible recipients returns 422 no-eligible. Validate owned references before exposing refreshed details. A changed contact address returns ADDRESS_CHANGED without retargeting; clear only that follow-up choice in the UI, refresh, and require selecting its new address explicitly.

Submission recovery: on ambiguous response, show "Checking whether your campaign was scheduled" and query the receipt. If absent, retry the identical frozen POST with the same key; never generate a new key from a timeout or 404. Limit automatic retries to two with backoff, then offer "Check again" using the same attempt. An actual validation response with no commit permits edits/new review. Success clears the pending attempt. Logout clears session data; cross-device recovery remains available through the campaign list and server receipts.

## 6. Neon PostgreSQL creation guarantees

### 6.1 Chosen concurrency approach

Use a short interactive transaction with explicit READ COMMITTED isolation and a transaction-scoped advisory lock per user. All campaign job creators acquire the same namespaced lock before authoritative eligibility reads. Different users can create concurrently; same-user creation is serialized for this small-scale sender.

Derive the database lock key deterministically from `campaign-create:v1:<user UUID>` using PostgreSQL `hashtextextended` with a fixed seed and call `pg_advisory_xact_lock`. Hash collisions cause unnecessary serialization, not a missed conflict. Use parameterized raw SQL and consume the void-returning function through a driver-compatible wrapper; prove it on the installed PrismaNeon adapter.

Acquire this lock in its own awaited SQL statement before reading eligibility. READ COMMITTED subsequent statements then see the preceding creator's committed jobs. Do not combine a blocking lock and eligibility read in one statement/snapshot. Do not use process-local mutexes, session advisory locks, or an advisory lock outside the transaction. Advisory locks are cooperative: make the shared service the only application creation entry point.

Neon's pooler uses transaction pooling and does not support session-level advisory locks. Transaction-scoped locks end with the transaction. This design avoids adding Redis or a separate reservation lifecycle. Sources: [Neon pooling](https://neon.com/docs/connect/connection-pooling), [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html).

Serializable isolation with bounded retries is a valid alternative, but is not the default here: the per-user creation boundary is easy to reason about and test. If creation throughput later needs parallelism per user, redesign the lock scope and prove overlapping-recipient behavior before relaxing it.

### 6.2 Transaction sequence

1. Authenticate and validate bounded input; normalize the payload and compute its request hash. Do not perform provider calls.
2. Start transaction; configure bounded transaction-local lock/statement timeouts and acquire the per-user advisory lock. Initial targets: lock wait 2 seconds, transaction execution 10 seconds, connection acquisition 5 seconds; tune against Neon cold-start and maximum-selection tests within the route runtime budget.
3. Look up the durable submission by `(user_id, idempotency_key)`. If found, compare request hash and return the recorded result immediately. Do this before a new history/preview check: an already-committed campaign must replay even though its jobs now appear in history.
4. Revalidate owned resources and load current material template/contact/field/attachment data. Compute fresh eligibility against committed jobs. Use exactly these loaded values to prepare job snapshots; later edits must not change the prepared email. Before insert, validate rendered subject against EmailJob's 255-character limit, PostgreSQL integer bounds for pace/cap, and every derived scheduled_at via campaignEmailTime. With one effective recipient, normalize interval to 5 and cap to null, as the current wizard does. With multiple recipients, retain valid entered pace/cap. Do not silently move a submitted start time; current due-job semantics apply. Return actionable 400 validation errors for invalid derived values, not partial inserts or unexplained 500s.
5. Compare the supplied material-plan fingerprint. If changed, return refreshed eligibility without campaign/job/submission writes. If blocked or empty, return the specified validation response with no writes. Incidental detail changes with an identical effective plan may proceed after all validations pass; use current detail counts in the response/receipt.
6. Create the campaign and all prepared SCHEDULED jobs. Bulk insert in bounded chunks if necessary, but keep all chunks in the same transaction. Create the durable submission record and accurate result summary in the same transaction.
7. Commit, then return success. The existing worker sees the ACTIVE campaign and complete job set only after commit; it cannot complete an empty campaign between these writes.

Do not fetch attachments from B2, call Gmail/SMTP, or compile the visual editor inside this transaction. Use existing rendered template columns. Concurrency protection is for campaign job creation; this does not promise exactly-once external email delivery after network/provider failures.

Do not retry every database exception. Retry an entire rolled-back transaction for verified transient deadlock/serialization errors at most twice with jitter; enforce an overall request budget. On an ambiguous commit/network timeout, resolve by querying/replaying the same submission key. Never manufacture a new key or report a definitely failed send without evidence. Validate actual SQLSTATE/Prisma error mappings in Neon integration tests.

### 6.3 Durable idempotency

Add `CampaignSubmission` with UUID ID, `user_id`, `idempotency_key` UUID, `request_hash`, `campaign_id`, `recipient_summary` JSON, `resend_recipients` JSON (validated normalized contact/address pairs, default []), and `created_at`. Unique `(user_id, idempotency_key)` and unique `campaign_id`; foreign keys to user/campaign. There is no separately committed "in progress" row: campaign, jobs, and receipt commit together.

Prisma model definition (add to `prisma/schema.prisma`):

```prisma
model CampaignSubmission {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id         String   @db.Uuid
  user            User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  idempotency_key String   @db.Uuid
  request_hash    String   @db.VarChar(64)
  campaign_id     String   @unique(map: "uq_campaign_submissions_campaign_id") @db.Uuid
  campaign        Campaign @relation(fields: [campaign_id], references: [id], onDelete: Restrict)
  recipient_summary Json   @db.JsonB
  resend_recipients Json   @default("[]") @db.JsonB
  created_at      DateTime @default(now()) @db.Timestamptz
  updated_at      DateTime @updatedAt @default(now()) @db.Timestamptz

  @@unique([user_id, idempotency_key], map: "uq_campaign_submissions_user_key")
  @@index([user_id, created_at], map: "idx_campaign_submissions_user_created")
  @@map("campaign_submissions")
}
```

Receipts are immutable. Retaining `updated_at` is optional metadata, not a repository-wide requirement; do not rely on equality with `created_at`. Store only the normalized contact/address pairs in `resend_recipients`; these addresses are personal data and must remain access-controlled. Do not store rendered bodies/credentials or log addresses. Restrict campaign deletion while a receipt exists so deletion cannot erase retry protection.

Add the back-relation to the `User` model in `prisma/schema.prisma`:

```prisma
  campaign_submissions CampaignSubmission[]
```

Add the one-to-one back-relation to `Campaign`:

```prisma
  submission CampaignSubmission?
```

Hash all canonical semantic creation inputs, including policy choices, canonically sorted normalized resend recipient pairs, ordered contact IDs, attachment IDs/order, schedule parameters, and preview fingerprint. Changing which 20 contacts are authorized is a different payload even if the count stays 20. Persist the explicit normalized follow-up set with the submission receipt for review of the accepted choices, alongside the final recipient summary; do not log addresses. Keep the receipt while the campaign exists. Do not expire successful keys on a short timer; any future campaign deletion must preserve a tombstone or reject old-key replay rather than allowing a new send accidentally.

The browser generates one key for each confirmed payload and retains the same key/payload during retries. Store the pending attempt in per-user sessionStorage to survive refresh in the same tab, clearing on logout or resolved success. Treat stored data as untrusted and never store rendered email bodies or credentials. If outcome is unknown, resolve that attempt before allowing edits to become a new submission. The required lookup `GET /api/campaigns/submissions/[key]` returns committed campaign identity/summary, or 404 meaning not found yet (not proof no request is in flight).

After a definitive validation/conflict response with no commit, the user may edit/review and generate a new key. A successful replay returns the original scheduled count even if job statuses changed since creation.

### 6.4 Job-level uniqueness and safe migration

Add nullable `EmailJob.creation_key` with a unique constraint. For every newly created campaign job, set it deterministically to `<campaign UUID>:<normalized recipient email>`. Legacy rows remain null; do not rewrite/delete existing job history to force historical uniqueness. Add a database CHECK requiring a non-null key to agree with its campaign ID and the SQL-normalized `to_email`, with `campaign_id IS NOT NULL` explicitly enforced when the key exists.

Prisma column addition (add to `EmailJob` model in `prisma/schema.prisma`):

```prisma
  creation_key String? @unique(map: "idx_email_jobs_creation_key_unique") @db.VarChar(321)
```

`321` allows the UUID, colon, and maximum email length with spare capacity. `@unique` generates an ordinary unique index; PostgreSQL permits multiple nulls by default. A second partial uniqueness index is unnecessary.

SQL CHECK constraint (Prisma DSL cannot express CHECK — add via raw SQL migration per the project's known Prisma limitation):

```sql
ALTER TABLE email_jobs
ADD CONSTRAINT email_jobs_creation_key_valid
CHECK (
  creation_key IS NULL
  OR (
    campaign_id IS NOT NULL
    AND creation_key = campaign_id::text || ':' || lower(btrim(to_email))
  )
);
```

This constraint permits legacy null keys and requires non-null keys to match their campaign/address. Keep it in a committed SQL migration. `prisma migrate reset` on a disposable database replays migration SQL, including CHECKs. `db push` is not a replacement for migration history and must not provision production/acceptance databases. Guard migration replay with `check-constraints.test.ts`.

This protects repeated insertion for one new campaign/address even when contact records differ. New creation code must always supply the key, and tests must assert this. Legacy-null rows are not retroactively protected by this constraint; cross-campaign eligibility still reads them. No API in this release regenerates jobs for legacy campaign IDs. Resume only changes campaign status.

Do not use `skipDuplicates` to conceal unexpected conflicts or return an inaccurate recipient count. On a creation-key violation, rollback and resolve through the submission record; unexplained conflicts are integrity errors. Failed delivery retries use the same job; deliberate later resends use a new campaign/key.

### 6.5 Indexes and query shape

Use SQL migrations for expression/partial indexes that Prisma cannot fully represent. Candidate history index:

```sql
CREATE INDEX idx_email_jobs_recipient_history_match
ON email_jobs (user_id, template_id, email_account_id, lower(btrim(to_email)))
WHERE status IN ('SENT', 'SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT', 'DELIVERY_UNKNOWN');
```

Use the same normalization expression in queries. Aggregate status existence by address, count unique recipients, and use bounded detail queries for last-sent/scheduled timestamps. Never count matching jobs as matching people, and never run one history query per selected contact. Inspect real query plans; parameterization must still allow the intended index to be used.

Add `(user_id, contact_id, created_at DESC, id DESC)` for contact history, plus submission uniqueness and creation-key uniqueness indexes. Evaluate an additional address-history index only if needed by a future address-history view. The initial contact history endpoint is contact-record scoped.

Full index DDL for all new indexes (add via SQL migration; Prisma `@@index` handles the simple ones but expression/partial indexes need raw SQL):

```sql
-- Candidate history match (expression + partial — must be raw SQL)
CREATE INDEX CONCURRENTLY idx_email_jobs_recipient_history_match
ON email_jobs (user_id, template_id, email_account_id, lower(btrim(to_email)))
WHERE status IN ('SENT', 'SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT', 'DELIVERY_UNKNOWN');

-- Contact history (for GET /api/contacts/[id]/emails)
CREATE INDEX CONCURRENTLY idx_email_jobs_contact_history
ON email_jobs (user_id, contact_id, created_at DESC, id DESC);

-- Campaign submission lookup by user + key (unique — Prisma @@unique handles this,
-- but include here for migration completeness)
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_submissions_user_key
ON campaign_submissions (user_id, idempotency_key);

-- Campaign submission lookup by campaign (unique — one receipt per campaign)
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_submissions_campaign_id
ON campaign_submissions (campaign_id);

-- Creation key uniqueness (ordinary unique index; multiple nulls allowed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_jobs_creation_key_unique
ON email_jobs (creation_key);
```

These statements describe target index definitions, not a second script to run after Prisma creates equivalent indexes. Use the model's mapped names and create each index once. For large tables, choose the controlled concurrent build path; for small tables omit CONCURRENTLY. `IF NOT EXISTS` checks names only, not definition or validity: inspect catalog definitions and `indisvalid`. Reset replays all migration SQL. Also retain the model's `(user_id, created_at)` receipt index. Add the contact-history index to Prisma with the same mapped name and descending sort order so later migrations do not create a duplicate.

On a large live table, build indexes concurrently in a separately controlled migration step outside an explicit transaction; verify index validity and record completion in deployment tooling. Small-table transactional creation is acceptable after measuring lock time. Use a direct Neon connection for migrations; do not print credentials. Regenerate Prisma client and verify both app and worker builds against additive schema changes.

## 7. Contact email history

Add authenticated `GET /api/contacts/[id]/emails?page=1&limit=20`, using `defineRoute` with `auth: 'user'`, existing list envelopes, maximum limit 100, and current-user scoping on both contact and job queries. Validate params.id with existing idParamSchema before querying; use a generic not-found response for absent/unowned contacts. Use `parseListQuery` and `respondList`; handle invalid pagination as a 400 validation error rather than allowing raw Zod errors to become 500. Order by `(created_at DESC, id DESC)`; page-number pagination follows current conventions and may shift as new jobs arrive. Refresh resets to page 1. Cursor pagination can follow if stable traversal under high write volume becomes necessary.

Select stored subject, recipient address, status, sent/scheduled timestamps, campaign ID/name/timezone, and a safe user-facing failure summary. SENT uses `sent_at`; pending rows use `scheduled_at`; unsent rows must not fabricate a sent date. Do not join EmailLog on the summary list: it multiplies rows and does not provide open/click tracking.

Load the section automatically when the contact page opens, independently of the contact-detail request. Show loading, empty, error/retry, and paginated states. Link campaign names to existing details; render "Ad-hoc" when campaign is absent. Unknown delivery uses the same explicit wording as the wizard. Reuse existing badges and pagination components.

Label this "Email history for this contact record." Always show the stored recipient address, including an old address after contact edits. Wizard address-based duplicate badges may reference another record with the same address; their explanation should say so and link the relevant owned record. Do not imply this endpoint covers all aliases or all records for a mailbox.

History and duplicate prevention cover retained jobs. Current template deletion can remove ad-hoc jobs; do not claim an immutable audit log. During implementation, inventory all job-deleting routes and document retention behavior. A permanent send ledger is separate work; intentional deletion of retained history changes future matching.

## 8. Implementation sequence and affected files

1. Add policy types, normalization, canonical fingerprint/request hashing, migration, and Neon integration coverage. Establish creation service as the sole writer.
2. Refactor scheduler/missing-value helpers to accept transaction clients and prepared snapshots. Implement atomic campaign creation, submission replay, and uniqueness. Update API validation and errors together.
3. Extend pre-check; add bounded row-status reads and submission lookup. Update campaign options/contact loading and preserve selections across pages.
4. Implement immediate summary, row badges, resend/missing-value choices, freshness state, final-count schedule preview, and structured parent/wizard result handling. Deploy the backend and wizard as one coordinated feature.
5. Add contact email history and its tests.
6. Validate on an isolated Neon branch, then canary release with production monitoring. This document does not itself authorize deployment.

Primary existing files: `prisma/schema.prisma`, `prisma/migrations/*`, `lib/jobs/scheduler.ts`, `lib/campaigns/missing-values.ts`, `lib/validation/campaign.ts`, `lib/errors/error-codes.ts`, `lib/errors/index.ts`, `lib/errors/error-handler.ts`, `app/api/campaigns/route.ts`, `app/api/campaigns/pre-check/route.ts`, `app/api/campaigns/options/route.ts`, `app/api/campaigns/recipient-status/route.ts` (new), `app/api/campaigns/submissions/[key]/route.ts` (new), `app/api/contacts/[id]/emails/route.ts` (new), `lib/campaigns/eligibility.ts` (new), `lib/campaigns/create.ts` (new), `components/campaigns/CampaignWizard.tsx`, `components/campaigns/SchedulePreview.tsx`, `app/(dashboard)/campaigns/page.tsx`, `app/(dashboard)/contacts/[id]/page.tsx`, and shared error types/serializers.

Read applicable guides in `node_modules/next/dist/docs/` before writing application code, as required by AGENTS.md. No sending-transport rewrite is required. Extend the current email and scheduling UI patterns rather than creating a parallel design system.

## 9. Required verification and release gates

### Database/API behavior

- Two simultaneous same-key/same-payload submissions produce one campaign/job set and return the same identity. Same key/different payload conflicts.
- Two different keys with overlapping addresses and default policy serialize: the later request must refresh/review and cannot silently create duplicate jobs.
- Two requests with overlapping explicit follow-up sets cannot duplicate an already-pending matching send. An intentional new send after an earlier one is SENT remains possible only for an explicitly chosen recipient and a fresh preview.
- Required HR scenario: with 150 selected contacts (100 previously sent plus 50 new) and 20 explicit follow-ups, create exactly 70 jobs and no jobs for the other 80. An empty follow-up set creates 50; selecting only those 70 and authorizing the same 20 also creates 70.
- Reject foreign/unselected/duplicate/non-representative/address-mismatched follow-up entries and unsupported global override fields. Adding contacts to the main selection does not add follow-up permission. Same key with a different 20-person set conflicts, even at the same count.
- Inject failure after campaign insertion and after a job chunk: campaign, jobs, and receipt all roll back. A worker reader cannot observe a partial campaign.
- Simulate lost response after commit, browser reload, pool reconnection, lock timeout, deadlock, and connection acquisition failure. Same-key recovery must remain safe.
- Exercise the installed PrismaNeon adapter through the actual service with at least two independent database connections on an isolated Neon branch. Mocks and single-connection sequential tests do not demonstrate race safety. Verify pooled transaction lock release after commit, rollback, and timeout.
- Test every status and mixed history, paused campaigns, unknown recovery to sent/failed, repeated IDs, duplicate contact addresses, changed addresses, edited templates, changed attachments, and legacy-null creation keys.
- Test every ownership boundary, request size/count limits, no-store headers, error-details serialization, and malformed fingerprints/keys. Replays remain scoped to their user.
- Verify default missing-value exclusions, explicit unresolved-token consent, overlapping exclusions, deterministic representative selection, zero recipients, one recipient, and exact persisted/preview schedule agreement.
- Verify fingerprint stability when history statuses or dates change without altering the planned send. Verify conflicts for changed recipient identities even at equal counts, effective message/attachment changes, or changed resend-consent facts. A matching fingerprint must never bypass ownership or status validation.
- Ensure creation-key unique conflicts fail atomically; do not mutate historical duplicates during migration. Verify all new jobs have the required key.

### UI behavior

- Exception badges appear for affected visible contacts before selection; ordinary eligible rows have no redundant success badges. Selection produces a summary without clicking Next or Schedule.
- The normal path needs no extra click, acknowledgment, or checkbox. With no exclusions, show only the planned count. With exclusions, show a compact summary and optional details; mixed exclusions must not all be described as repeat sends.
- Rapid changes and out-of-order responses never show stale counts as ready. Failed previews keep scheduling disabled with a visible retry.
- Selection survives pagination/search; bulk selection accurately names its scope; counts reconcile including duplicate address records.
- Follow-up checkboxes authorize only specific selected recipients with SENT history, never pending or unknown jobs. Missing-value choices update preview without submitting.
- The HR scenario is usable without deselecting 80 contacts: choose 20 in the previous-recipient list and see 50 new + 20 follow-ups = 70 before submission. Follow-up search/pagination retain choices, and bulk action scope is explicit.
- Irrelevant exception controls are hidden; chosen follow-ups remain visible and removable. Deselect/reselect, sender/template changes, and changed addresses/representatives cannot silently preserve or broaden resend permission. Full breakdowns stay collapsed by default on Schedule/Review, while blocking problems remain immediately visible.
- Schedule, Review, and the final button all use the same effective count. Zero and single-recipient states are correct.
- Only material planned-send/consent changes require a new confirmation. An unchanged-input background refresh does not repeatedly disable a fresh ready preview; input changes, expiry, and failures do. Late refreshes cannot mutate an in-flight submission. Lost-response recovery reuses the existing key.
- Keyboard, focus, screen reader announcements, mobile layout, loading, empty, and history error states are verified visually and with relevant component tests.

### Performance and operations

Use a representative Neon branch with at least 100,000 historical jobs and 1,000 selected contacts. Measure cold and warm pre-check latency, transaction duration, query plans, memory, and lock contention. Initial warm target: selected-recipient pre-check p95 under 1 second and campaign creation p95 under 3 seconds, excluding deliberate lock wait. These are acceptance targets to measure, not current claims. If the maximum payload cannot fit the bounded transaction, reduce the supported cap before launch or design a separate staged-generation protocol; do not expose partially created campaigns.

Log request ID, campaign ID, policy version, selected/eligible/excluded counts, replay outcome, preview conflict count, and transaction/lock timing. Do not log email addresses, rendered content, credentials, or complete request payloads. Monitor 409 refresh rate, 503 contention, unexpected unique conflicts, and creation failures.

Run relevant unit/component/API tests, real Neon concurrency tests, `typecheck`, `lint`, app build, and worker dry-run build. Coordinate rollout so old API instances that bypass the lock/key protocol cannot continue creating campaigns alongside new ones. Apply additive migrations first; gate campaign creation during an incompatible mixed deployment. Re-enabling old unsafe creation code is not an acceptable rollback: keep creation disabled if rolling back requires losing the guarantees. Existing queued sends may continue.

Production readiness requires passing these gates and reviewing migration/rollback evidence. A completed plan or green mocked suite alone is not production certification.

## 10. Implementation readiness checklist

Use this as an implementation completion checklist. Leave items unchecked until implemented and verified. Any new repository incompatibility must be resolved without weakening the documented guarantees.

### Schema and migrations
- [ ] `CampaignSubmission` Prisma model added to `prisma/schema.prisma` (§6.3 provides the exact model).
- [ ] `EmailJob.creation_key` column added (§6.4 provides the Prisma column + SQL CHECK).
- [ ] Target indexes created exactly once with matching mapped names; expression/partial index and CHECK SQL retained in migration history.
- [ ] `check-constraints.test.ts` guards the CHECK after migration replay; production does not use db push.
- [ ] Both User and Campaign back-relations added; receipt campaign FK uses Restrict.

### Shared services
- [ ] `lib/campaigns/eligibility.ts` created with policy types, normalization, set-based history queries.
- [ ] `lib/campaigns/create.ts` created as the sole campaign+job creation entry point.
- [ ] `generateCampaignJobs` refactored: first parameter `PrismaClient` → `TransactionClient`, accepts prepared snapshot instead of raw `contactIds`.
- [ ] Missing-value logic refactored to accept `TransactionClient` and prepared snapshots.
- [ ] Database-normalized address keys used consistently in grouping, matching, fingerprints, and creation keys, including non-ASCII tests.
- [ ] Fingerprint (SHA-256) and request-hash functions implemented with canonical ordering.

### API routes
- [ ] `POST /api/campaigns/pre-check` extended with all fields from §5.2.
- [ ] `POST /api/campaigns` extended with `idempotency_key`, `preview_fingerprint`, `resend_recipients`, `missing_value_action`, `unknown_token_action` per §5.3.
- [ ] `POST /api/campaigns/recipient-status` created per §5.4.
- [ ] `GET /api/campaigns/submissions/[key]` created per §5.5.
- [ ] `GET /api/contacts/[id]/emails` created per §7.
- [ ] All new routes use `defineRoute` from `@/lib/api/route` with correct auth (`'user'` or ownership-based).
- [ ] All new routes use `respondOk`/`respondError`/`respondList` from `@/lib/api/respond`.
- [ ] `GET /api/contacts/[id]/emails` uses `parseListQuery` from `@/lib/api/list` for pagination.
- [ ] All routes validate ownership with `user_id` scoping.
- [ ] All routes return `private, no-store` headers.

### Error handling
- [ ] New error codes added to `ERROR_CODES` const in `lib/errors/error-codes.ts`.
- [ ] New `AppError` subclasses created in `lib/errors/index.ts` per §5.3 table.
- [ ] `ApiErrorResponse` extended to carry `details` for structured eligibility/conflict data.
- [ ] Creation service resolves relevant P2002 via receipts after rollback; shared error conversion remains synchronous.
- [ ] `createCampaign` handler returns structured result to wizard (not just a toast).

### Validation
- [ ] `preCheckSchema` (camelCase) per §5.7.
- [ ] `createCampaignSchema` extended (snake_case) with new fields per §5.7.
- [ ] `recipientStatusSchema` (camelCase, max 100) per §5.7.
- [ ] All schemas reuse `uuid` and `email` from `@/lib/validation/common` — no redefined validators.
- [ ] Contact cap (1,000) enforced in both Zod schema and UI.
- [ ] `resend_recipients` subset validation in Zod + server-side ownership/representativeness/address check.

### UI
- [ ] `CampaignWizard.tsx` updated with live eligibility, summary, follow-up controls.
- [ ] Contact picker moved to paginated `/api/contacts` reads (page size 50, max 100).
- [ ] Selection preserved across pages/search.
- [ ] Follow-up checkboxes appear only when selected contacts have SENT history.
- [ ] SchedulePreview uses effective count for timings; CampaignWizard uses the same count for its button.
- [ ] Freshness state machine: `idle` → `checking` → `ready` / `stale` / `error`.
- [ ] 250 ms debounce on selection; immediate on sender/template/attachment.
- [ ] 30 s background poll; 60 s freshness window.
- [ ] `aria-live="polite"` on summary; keyboard accessible controls.
- [ ] Reuses existing custom Select for form values, Dropdown for action menus, and existing buttons/badges/search/pagination states.

### Tests
- [ ] Real Neon concurrency tests (≥2 independent connections, isolated branch).
- [ ] HR scenario: 150 selected, 20 follow-ups → exactly 70 jobs.
- [ ] Idempotency: same key/same payload → one campaign; same key/different payload → 409.
- [ ] Creation-key uniqueness violation → atomic rollback.
- [ ] Fingerprint stability on incidental changes; conflict on material changes.
- [ ] All status combinations, mixed history, paused campaigns, unknown recovery.
- [ ] Ownership boundaries, request size/count limits, no-store headers.
- [ ] `typecheck`, `lint`, `test`, `build`, and `build:worker` pass; real Neon concurrency and browser acceptance evidence recorded.

## 11. References

- [Prisma migrate reset](https://docs.prisma.io/docs/cli/v7/migrate/reset): reset replays all migration SQL on a disposable database.
- [PostgreSQL unique indexes](https://www.postgresql.org/docs/17/indexes-unique.html): ordinary unique indexes allow multiple nulls by default.
- [Brevo recipient exclusions](https://help.brevo.com/hc/en-us/articles/15152720243730-Exclude-and-filter-recipients-from-your-email-campaigns): automatic duplicate-address handling across selected lists and recipient exclusions.
- [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys): repeated-request protection at the API layer. This is an industry example, not a request to replace the app's existing email transports.
- These product examples support automatic address/request protection. They do not establish lifetime template-based suppression as an industry requirement; that remains the explicit app policy in section 3.
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling): pooled versus direct connections and transaction-mode constraints.
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html): transaction-scoped advisory locks and lock lifetime.
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html): statement snapshots and serialization behavior.
- [Prisma database connections](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections): driver-adapter connection/pool configuration.
- Repository evidence: files listed in sections 2 and 8; installed `node_modules/@prisma/adapter-neon/dist/index.js` transaction implementation.
