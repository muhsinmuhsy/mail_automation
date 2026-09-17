# EMAIL_LIMIT_ARCHITECTURE_FIX

## Status: READY FOR IMPLEMENTATION — 7 review rounds complete, 3 pre-implementation checks below

## 0. Pre-Implementation Checklist

Three items must be verified/handled during implementation (flagged in final review):

### 0.1 Cloudflare Queue duplicate delivery protection

**Current state:** `wrangler.toml` uses a **push-based** Worker consumer (`[[queues.consumers]]` with `max_batch_size = 10`). There is no `visibility_timeout` property — and **`visibility_timeout` is only valid for pull-based queues**, not push-based Worker consumers. Adding it to `wrangler.toml` would be ignored or error.

**Actual push-based consumer protections (verified against Cloudflare docs):**

| Protection | Mechanism | Limit |
|------------|-----------|-------|
| Wall time limit | Consumer invocation killed if exceeded; batch retried | 15 minutes per invocation |
| CPU time limit | Configurable via `limits.cpu_ms` | 30s default, up to 5 min |
| Explicit `ack()` | Consumer calls `ack()` after processing — message not re-delivered | Per-message |
| `max_retries` | Failed delivery retried up to N times, then DLQ or deleted | Default 3 |
| Idempotency check | `reserveEmailCapacity` finds existing RESERVED reservation → skips | Per `(email_job_id, attempt_number)` |

**Analysis:** With `max_batch_size = 10` and SMTP sends taking ~10s each (I/O, not CPU), a batch takes ~100s wall time — well within the 15-minute limit. CPU time is minimal (DB queries + reservation logic). The consumer already calls `ack()` after `processQueueJob` returns. The idempotency check is the secondary guard against duplicate reservations.

**Conclusion:** No `wrangler.toml` change needed for duplicate delivery protection. The existing push-based consumer protections are sufficient. The `wrangler.toml` entry in files-to-modify is **removed**.

**If CPU time becomes a bottleneck:** Add `[limits]` section with `cpu_ms = 300000` (5 minutes) — but this is not needed for the current batch size.

### 0.2 Real PostgreSQL for concurrency tests

**Requirement:** Serializable isolation, P2034 conflicts, concurrent upsert operations, and counter consistency CANNOT be verified with mocked Prisma. These tests must use a real isolated PostgreSQL database.

**How:** Concurrency tests go in `tests/integration/db/` (new directory) and connect to a real test database. The existing memory from prior work confirms this requirement: "concurrency tests must hit a real isolated PostgreSQL DB (not mocked Prisma) to prove Serializable isolation."

### 0.3 Consumer state transitions for P2034 exhaustion

**Requirement:** When P2034 exhaustion occurs, the consumer must:
1. Update the job to `QUEUED` (not SENT, not RETRY_WAIT, not SCHEDULED)
2. Acknowledge the queue message (`ack()`) — DB is source of truth, scheduler re-enqueues based on DB state
3. NOT overwrite an existing `error_message` (P2034 exhaustion is transient, not user-facing — do not store it in `error_message`)
4. NOT mark the email as successfully sent

**Verification:** Add a test that simulates P2034 exhaustion and asserts all four conditions. This is in addition to the "P2034 retry exhaustion" test in Phase 5.

## 1. Current System

### 1.1 The four limit levels

| # | Name | DB column | Scope | Who sets it | Default |
|---|------|-----------|-------|-------------|---------|
| 1 | Global | `system_settings.global_daily_email_limit` | Entire system, ALL users combined | Admin | 500 |
| 2 | Default | `system_settings.default_daily_email_limit` | New users at signup only | Admin | 20 |
| 3 | User override | `user.daily_email_limit_override` (nullable) | Per user | Admin (or auto from Default at signup) | null |
| 4 | Campaign | `campaign.daily_limit` (nullable) | Per campaign | User creating campaign | null |

### 1.2 How the effective limit is computed today

File: `lib/limits/email-limit-service.ts` lines 18-49

```
effective = min(global, user_override, campaign_limit)
```

**Current behavior:** Any level that is `null`, `0`, or missing is **skipped** in the `min()` — the code uses truthy checks (e.g., `if (user?.daily_email_limit_override && ... > 0)` at line 34), so `0` is treated as "not set" rather than "no emails allowed."

**Target behavior:** `null` means no limit at that level (skip it in `min()`). A database value of `0` is an **active zero limit** — it must NOT be skipped; `min(0, ...) = 0` blocks all sending. Missing `system_settings` rows use the documented hardcoded fallback (20/500).

**Implementation warning:** Do NOT use truthy checks like `if (globalLimit)` or `if (limit && limit > 0)` — these incorrectly skip `0`. Use explicit `null` checks: `if (globalLimit !== null)`. The current code at `email-limit-service.ts:34` and `:43` uses the truthy pattern and must be changed.

### 1.3 How enforcement works today

File: `lib/limits/email-limit-service.ts` lines 126-205 (`reserveEmailCapacity`)

Runs inside `prisma.$transaction`:

1. Check `email_sending_enabled` (kill switch)
2. Check `user.is_active`
3. Idempotency check on existing reservation
4. Compute `effectiveLimit = min(global, user_override, campaign_limit)`
5. Read `emailUsageDaily` (user-level counter) for today
6. Check: `available = effectiveLimit - user_sent - user_reserved`. If `<= 0`, fail with `"Daily email limit reached."`
7. Increment `reserved_count` on `emailUsageDaily`, `systemUsageDaily`, `campaignUsageDaily`
8. Create `EmailSendReservation` row

### 1.4 Usage tracking tables

| Table | Key | Tracks |
|-------|-----|--------|
| `email_usage_daily` | `(user_id, usage_date)` | Per-user daily sent + reserved |
| `campaign_usage_daily` | `(campaign_id, usage_date)` | Per-campaign daily sent + reserved |
| `system_usage_daily` | `(usage_date)` | System-wide daily sent + reserved |

All three are incremented in lockstep inside the reservation transaction.

### 1.5 Where limits are displayed in the UI

| Page | What it shows | Data source |
|------|--------------|-------------|
| Dashboard (`/dashboard`) | User effective limit + usage | `/api/user/email-limit` → `getUserDailyUsage` |
| Campaign Wizard step 3 | User effective limit as cap on "Emails per day" input | Same endpoint |
| Campaign Detail (`/campaigns/[id]`) | Campaign `daily_limit` + campaign usage | `/api/campaigns/[id]` → `getCampaignDailyUsage` |
| Admin Settings (`/admin/settings`) | Global limit + system usage | `/api/admin/settings` → `getSystemDailyUsage` |
| Admin Users table | Per-user override (editable) | `/api/admin/users` |

### 1.6 How modern systems handle multi-tier limits

| System | Approach |
|--------|----------|
| **Mailchimp** | Single tier: "Your plan allows X/day." No per-campaign limit. One number, one check. |
| **SendGrid** | Single tier: account quota. Per-campaign is a *pacing* setting, not a hard limit. |
| **Postmark** | Single tier: "X/Y sent today" — account-wide, one number. |
| **AWS SES** | Multi-tier (account + per-configuration-set). **Each tier checked independently.** Error names which tier failed. |

The pattern for multi-tier: **check each level independently, fail with a specific message naming which level was hit.** This is what we adopt.

---

## 2. Problems Found

### 2.1 BUG: Global limit is NOT enforced

`reserveEmailCapacity` only checks the **user-level counter** against the effective limit. `systemUsageDaily` is incremented but **never checked**.

**Impact:** If global=500 and 10 users each have override=100, they can collectively send 1,000 emails/day — exceeding the global cap.

### 2.2 BUG: Campaign limit is NOT independently enforced

The effective limit uses `min(global, user, campaign)` but checks it against the **user's total usage across ALL campaigns**, not this campaign's usage.

**Impact:** If user override=100 and campaign A limit=2, and the user already sent 1 email from campaign B, then campaign A's available capacity shows 1 (not 2), even though campaign A sent 0 today. The campaign counter is tracked but not independently checked.

### 2.3 BUG: "Default" is not a true fallback

`default_daily_email_limit` is only applied **once at signup** as the initial `daily_email_limit_override`. If an admin later clears a user's override (sets to null), the user falls back to the **global** limit (500), not the default (20).

**Impact:** Admin clears a user's override → user jumps from 20 to 500. Dangerous and unexpected.

### 2.4 UX: Error messages are generic

The error `"Daily email limit reached."` does not say **which** limit was hit. The campaign detail card shows "0 of 2, 2 remaining" (campaign limit) while the email failed because of the **account** limit — contradictory and confusing.

### 2.5 UX: Campaign detail shows raw campaign limit, not effective

`getCampaignDailyUsage` returns `campaign.daily_limit` (the raw value), not `min(global, user, campaign)`. The `UsageProgress` card on campaign detail shows "0 of 2" but the actual effective limit might be different if the user override or global is lower.

---

## 3. Target Architecture

### 3.1 Limit hierarchy (unchanged — 4 levels)

The four levels stay the same. They are a good design. The problem is **enforcement**, not the hierarchy.

### 3.2 "Default" becomes a true runtime fallback

When a user has no override (`daily_email_limit_override IS NULL`), their per-user limit is the **default**, not the global.

```
userLimit = user.daily_email_limit_override ?? systemSetting.default_daily_email_limit
```

The global limit is always the hard ceiling on top, checked independently at the system level.

### 3.3 Each level checked independently in `reserveEmailCapacity`

Instead of one `min()` check, do three separate checks inside the transaction. **Check order is intentional: system → account → campaign.** If multiple limits are exhausted simultaneously, the system-level error is reported first (most authoritative), then account, then campaign. This priority is by design — the broadest constraint is reported first.

```
1. System check:
   systemSent + systemReserved >= global_daily_email_limit
   → FAIL: "System daily limit reached ({systemSent + systemReserved} of {global}). Try again tomorrow."

2. User check:
   userLimit = user.daily_email_limit_override ?? default_daily_email_limit
   userSent + userReserved >= userLimit
   → FAIL: "Account daily limit reached ({userSent + userReserved} of {userLimit}). Resets at midnight UTC."

3. Campaign check (only if campaign.daily_limit is set):
   campaignSent + campaignReserved >= campaign.daily_limit
   → FAIL: "Campaign daily limit reached ({campaignSent + campaignReserved} of {campaign.daily_limit}). Resets at midnight UTC."
```

The email sends only if **all three** pass. The error names the **specific** limit that blocked it.

### 3.4 Effective limit for display

For UI display, the effective limit is still `min(global, userLimit, campaignLimit)` — but `userLimit` now uses the default fallback:

```
userLimit = user.daily_email_limit_override ?? default_daily_email_limit
effective = min(global, userLimit, campaignLimit)
```

### 3.5 Error messages — specific, actionable, and machine-parseable

Each limit error includes a **structured code prefix** in `error_message` so the retry endpoint can match on the code, not fragile substring matching. Format: `[CODE] Human-readable message`.

| Condition | Code | Error message stored in `email_jobs.error_message` |
|-----------|------|---------------------------------------------------|
| System limit hit | `[SYSTEM_DAILY_LIMIT]` | `[SYSTEM_DAILY_LIMIT] System daily limit reached (500 of 500). Try again tomorrow.` |
| Account limit hit | `[ACCOUNT_DAILY_LIMIT]` | `[ACCOUNT_DAILY_LIMIT] Account daily limit reached (20 of 20). Resets at midnight UTC.` |
| Campaign limit hit | `[CAMPAIGN_DAILY_LIMIT]` | `[CAMPAIGN_DAILY_LIMIT] Campaign daily limit reached (2 of 2). Resets at midnight UTC.` |
| P2034 retry exhaustion | `[QUOTA_TRANSACTION_CONFLICT]` | Not stored in `error_message`. Logged internally only. Job set to QUEUED (never SCHEDULED or RETRY_WAIT). Scheduler retries after 10-minute stale-queued period. |
| Sending disabled | — | `Email sending is currently disabled.` (unchanged) |
| User inactive | — | `User account is inactive.` (unchanged) |

**Centralized in a shared module** (`lib/limits/error-codes.ts`):
- Export the code constants and a helper `stripErrorCode(message): string` that removes the `[CODE] ` prefix for UI display
- Export `isLimitError(message): boolean` that checks for the three limit codes (`[SYSTEM_DAILY_LIMIT]`, `[ACCOUNT_DAILY_LIMIT]`, `[CAMPAIGN_DAILY_LIMIT]`) OR the legacy string `'Daily email limit reached'` (backward compatibility for existing emails in the database). Does NOT match `[QUOTA_TRANSACTION_CONFLICT]` — that is a transient error, not a limit block, and manual retry should be allowed.
- Export `isTransientError(message): boolean` that checks for `[QUOTA_TRANSACTION_CONFLICT]` — used by the consumer to distinguish transient failures from limit blocks
- The retry endpoint and UI components both use these helpers — no inline string matching

**Legacy backward compatibility:** Existing emails in the database may have the old error message `"Daily email limit reached."` without a code prefix. The `isLimitError` helper must also match this legacy string so those emails are still blocked from manual retry. New emails get the structured `[CODE]` format.

The UI displays the message **without** the code prefix (via `stripErrorCode`). Legacy messages without a prefix are displayed as-is.

### 3.6 Retry endpoint — match on structured error codes

File: `app/api/emails/[id]/retry/route.ts` line 28

Currently matches on the substring `'Daily email limit reached'` — fragile, breaks if message wording changes. Replace with the centralized `isLimitError` helper from `lib/limits/error-codes.ts`:

```ts
import { isLimitError } from '@/lib/limits/error-codes';
if (isLimitError(job.error_message)) {
  return respondError(new AppError('...'), ctx.requestId);
}
```

This helper matches on `[SYSTEM_DAILY_LIMIT]`, `[ACCOUNT_DAILY_LIMIT]`, `[CAMPAIGN_DAILY_LIMIT]` code prefixes AND the legacy string `'Daily email limit reached'` for backward compatibility with existing database records.

### 3.7 UI — who sees what

| Page | Limit shown | Usage shown | Label |
|------|------------|-------------|-------|
| **Dashboard** | `min(global, userLimit)` | User's `emailUsageDaily` | "Your daily email usage" |
| **Campaign Detail** | `min(global, userLimit, campaignLimit)` | Campaign's `campaignUsageDaily` | "Campaign daily usage" |
| **Campaign Wizard** | `min(global, userLimit)` as cap | User's usage | "Your account daily limit" |
| **Admin Settings** | `global` | `systemUsageDaily` | "System-wide usage" |
| **Admin Users** | Per-user override (editable) | — | "Daily limit" |
| **Email row error** | — | — | Specific: "Account/Campaign/System daily limit reached" |

Users **never** see "global limit" or "system usage" — only their account limit and campaign limit. Admin sees everything.

### 3.8 Campaign detail — show effective limit with limiting scope

`getCampaignDailyUsage` should return the **effective** limit and the **limiting scope** (which tier is capping), not just the raw `campaign.daily_limit`.

Return type:
```ts
{
  sent: number;
  reserved: number;
  limit: number;              // effective = min(global, userLimit, campaignLimit)
  configuredLimit: number | null;  // raw campaign.daily_limit
  limitingScope: 'SYSTEM' | 'ACCOUNT' | null;  // which tier caps below campaign
  limitingLimit: number | null;    // the value of the capping tier
}
```

**`limitingScope` determination — deterministic algorithm:**

1. Compute `effective = min(global, userLimit, campaignLimit ?? Infinity)`
2. If `campaignLimit` is null → `null` (no campaign limit configured, no note needed)
3. If `effective >= campaignLimit` → `null` (campaign limit is the binding constraint, no note needed — the card shows the campaign's own limit)
4. If `effective < campaignLimit` → something below the campaign limit is capping:
   - If `global < userLimit` → `'SYSTEM'` (global is the tightest cap)
   - If `userLimit < global` → `'ACCOUNT'` (account is the tightest cap)
   - If `global == userLimit` → `'ACCOUNT'` (tie-break: account is more relevant to user)

`null` means **"no additional UI explanatory note is needed"** — NOT "no limit is active." It covers: no campaign limit configured, or the campaign limit is the binding constraint (the card already shows it).

**Why no `'CAMPAIGN'` value:** `'CAMPAIGN'` and `null` would both mean "campaign is the effective limit, no note needed." To avoid ambiguity, `null` covers both cases. The type is simply `'SYSTEM' | 'ACCOUNT' | null`.

**Verification of the algorithm (friend's example):**
- Global=100, Account=50, Campaign=100 → effective=50 < 100 → userLimit(50) < global(100) → `'ACCOUNT'` ✓
- Global=15, Account=20, Campaign=100 → effective=15 < 100 → global(15) < userLimit(20) → `'SYSTEM'` ✓
- Global=20, Account=20, Campaign=100 → effective=20 < 100 → global==userLimit → `'ACCOUNT'` (tie-break) ✓
- Global=500, Account=20, Campaign=2 → effective=2 == campaignLimit(2) → `null` ✓
- Global=500, Account=20, Campaign=null → `null` (no campaign limit) ✓

The `UsageProgress` card shows the effective limit. When `limitingScope` is not null, show a note:

| `limitingScope` | UI note |
|-----------------|---------|
| `'ACCOUNT'` | `ⓘ Limited by your account daily limit of {limitingLimit}` |
| `'SYSTEM'` | No additional explanatory note is needed. (Users don't know about system limits — the effective number is just "their limit.") |
| `null` | No additional explanatory note is needed. |

This prevents confusion when a user sets campaign limit=100 but sees "of 20" because their account limit is 20, or "of 15" because the global limit is 15.

### 3.9 Concurrency and consistency requirements

The current code uses `prisma.$transaction` without specifying an isolation level, defaulting to `READ COMMITTED`. Under `READ COMMITTED`, two concurrent transactions can both read the same counter value, both pass the check, and both increment — causing quota overrun.

**Fix:** Use `Serializable` isolation level for `reserveEmailCapacity` with an **explicit bounded application-level retry loop** for P2034 serialization conflicts:

```ts
const MAX_ATTEMPTS = 3;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    return await prisma.$transaction(
      async (tx) => { /* reservation logic */ },
      { isolationLevel: 'Serializable' }
    );
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'P2034' && attempt < MAX_ATTEMPTS) continue;
    throw error;
  }
}
```

**Important:** Prisma's `maxWait` and `timeout` options control transaction slot waiting and execution time — they do NOT implement automatic retries for serialization conflicts. The application must catch `P2034` and retry explicitly. The codebase already handles P2034 in `lib/campaigns/create.ts` (line 326) but maps it to an error — that pattern does NOT retry.

**Terminology:** `MAX_ATTEMPTS = 3` means **3 total transaction attempts** (initial + 2 retries). Not "3 retries after the first" (which would be 4 total). Use `MAX_ATTEMPTS` consistently, never `MAX_RETRIES`.

The codebase already supports `isolationLevel` (used in `lib/campaigns/create.ts` with `ReadCommitted`). Prisma version is 7.10.0.

**Requirements:**
- All quota reservations must be concurrency-safe — no quota overrun under concurrent requests
- A successful reservation must atomically account for system, user, and campaign reserved usage
- **Explicit bounded retry loop** — `MAX_ATTEMPTS = 3` (3 total attempts including initial). If all attempts fail, return `{ success: false, reason: '[QUOTA_TRANSACTION_CONFLICT] ...' }` without creating a partial reservation
- **P2034 exhaustion is NOT a limit error.** The consumer must distinguish between limit errors (→ RETRY_WAIT, next_attempt_at = tomorrow midnight) and P2034 exhaustion (→ set job to QUEUED, never SCHEDULED or RETRY_WAIT, log internally, let scheduler retry after 10-minute stale-queued period). P2034 is transient — the job should NOT wait until tomorrow.
- Reservation release and commit must preserve counter consistency (already handled by existing `releaseReservation`/`commitReservation` — verify with tests)
- Existing reservation idempotency must remain intact (the `findFirst` check on `(email_job_id, attempt_number, RESERVED)` stays)
- The implementation must use `Serializable` isolation for the reservation transaction
- **Counter non-negativity:** No DB CHECK constraint prevents `reserved_count` or `sent_count` from going negative. Application logic (idempotency check on reservation status + transaction atomicity) prevents this. Verify with tests — a double-release or double-commit must not decrement below zero.

**Concurrency scenarios to verify:**
- Concurrent requests for the same account (same `emailUsageDaily` row)
- Concurrent requests across different accounts sharing the system limit (same `systemUsageDaily` row)
- Concurrent requests for the same campaign (same `campaignUsageDaily` row)
- Counter creation when today's usage row doesn't exist yet (two transactions both `upsert` the same row — one will abort under Serializable, retry handles it)
- P2034 retry behavior — aborted transaction is retried, not lost
- P2034 retry exhaustion — job set to QUEUED (10-min backoff via scheduler's stale-QUEUED detection), not RETRY_WAIT; no partial reservation created; no tight loop (atomic UPDATE in scheduleDueJobs + cron interval + queue visibility timeout + idempotency check)
- Idempotency under concurrent requests — same `(email_job_id, attempt_number)` submitted twice → one succeeds, other finds existing reservation (or gets P2034, retries, finds existing)
- Retrying after a committed reservation → does not increment counters again (idempotency check on reservation status)
- Failed transaction → no partial usage updates (transaction atomicity guarantees this)

**Database constraints verified (from schema audit):**
- `EmailUsageDaily`: `@@id([user_id, usage_date])` — composite primary key ✓
- `CampaignUsageDaily`: `@@id([campaign_id, usage_date])` — composite primary key ✓
- `SystemUsageDaily`: `usage_date @id` — single primary key ✓
- `EmailSendReservation`: `@@unique([email_job_id, attempt_number])` — unique constraint ✓
- No CHECK constraint on counter non-negativity — rely on application logic (idempotency + transaction atomicity). Verify with tests.

**Note:** This is a pre-existing race condition in the current code. Fixing it as part of the independent-checks refactor is the right time — both changes touch the same transaction.

### 3.10 Limit value semantics

Explicit definition of how limit values are interpreted:

| Value | Behavior |
|-------|----------|
| `user.daily_email_limit_override = null` | Use `default_daily_email_limit` as runtime fallback |
| `user.daily_email_limit_override = positive int` | Use the override value |
| `user.daily_email_limit_override = 0` | Rejected by validation (`z.coerce.number().int().positive()`) — cannot be set through API |
| `user.daily_email_limit_override = negative` | Rejected by validation — cannot be set through API |
| `campaign.daily_limit = null` | No campaign-level check (skip campaign check in `reserveEmailCapacity`) |
| `campaign.daily_limit = positive int` | Use as campaign limit |
| `campaign.daily_limit = 0` | Rejected by validation and DB CHECK constraint (`campaigns_daily_limit_check`) |
| `system_settings.default_daily_email_limit` missing/zero | Missing settings row → hardcoded 20. Zero value → correctly means "no emails" (not fallback to 20) |
| `system_settings.global_daily_email_limit` missing/zero | Missing settings row → hardcoded 500. Zero value → correctly means "no emails" (not fallback to 500) |

**Hardcoded fallback safety:** The hardcoded 20/500 only applies when the `system_settings` row is completely missing (e.g., fresh database before admin settings upsert). A value of `0` in the database (possible via direct SQL, though rejected by API validation) correctly means "no emails can be sent" — it does NOT silently fall back to 500. This is safe: `effective = min(0, ...) = 0` → all sends blocked. If an admin wants to disable sending, they should use the `email_sending_enabled` kill switch, not set limits to 0.

**Admin changes default limit:** When admin changes `default_daily_email_limit`, all users without an override immediately get the new default as their runtime limit. This is **intended** — the default is a true runtime fallback, not just a signup-time seed. Existing users with explicit overrides are unaffected.

**Timezone and reset:** All usage dates are bucketed by `utcToday()` which uses `setUTCHours(0, 0, 0, 0)` — UTC midnight. The consumer sets `next_attempt_at` to the next UTC midnight. "Resets at midnight UTC" in error messages is accurate. All users share the same UTC reset boundary.

---

## 4. Implementation Plan

### Phase 1: Fix `getEffectiveDailyEmailLimit` (default fallback)

**File:** `lib/limits/email-limit-service.ts`

Change the user limit resolution from:
```
if (user?.daily_email_limit_override && > 0) → min(effective, override)
```
to:
```
userLimit = user?.daily_email_limit_override ?? settings.default_daily_email_limit
effective = min(global, userLimit)
if campaignId → effective = min(effective, campaign.daily_limit)
```

This fixes Bug 2.3 (default not a true fallback).

### Phase 2: Fix `reserveEmailCapacity` (independent checks + concurrency safety)

**File:** `lib/limits/email-limit-service.ts`

1. Wrap the transaction in a **bounded retry loop** (max 3 attempts) for P2034 serialization conflicts
2. Change transaction to use `Serializable` isolation: `prisma.$transaction(async (tx) => { ... }, { isolationLevel: 'Serializable' })`
3. Replace the single `min()` check with three independent checks:
   - Read `systemUsageDaily`, `emailUsageDaily`, `campaignUsageDaily` for today
   - Check system: `systemSent + systemReserved >= global` → fail with `[SYSTEM_DAILY_LIMIT]` message
   - Check user: `userSent + userReserved >= userLimit` → fail with `[ACCOUNT_DAILY_LIMIT]` message
   - Check campaign (if set): `campaignSent + campaignReserved >= campaignLimit` → fail with `[CAMPAIGN_DAILY_LIMIT]` message
4. If all pass, increment all three counters and create reservation
5. On P2034 (`TransactionConflictError`): if attempts remain, retry the complete transaction. If all attempts exhausted, return `{ success: false, reason: '[QUOTA_TRANSACTION_CONFLICT] ...' }` without creating a partial reservation
6. **Consumer behavior change:** The consumer (`lib/jobs/consumer.ts`) must distinguish between limit errors and P2034 exhaustion:
   - Limit error (`isLimitError(reason)`) → RETRY_WAIT, `next_attempt_at` = tomorrow midnight (existing behavior)
   - P2034 exhaustion (`isTransientError(reason)`) → set job to `QUEUED` status (not RETRY_WAIT, not SCHEDULED). The scheduler only re-picks QUEUED jobs after 10 minutes (`updated_at <= now() - interval '10 minutes'` in `scheduleDueJobs`), providing a natural backoff without a tight loop. Log at `warn` level with rate limiting. Do NOT store error_message (not user-facing).
   - Kill switch / inactive → existing behavior (RETRY_WAIT or FAILED)

   **Why QUEUED, not SCHEDULED:** If left as SCHEDULED, the next cron tick (1 min) would immediately re-pick it (`scheduled_at <= now()` is still true), creating a retry every minute. Setting to QUEUED gives a 10-minute backoff via the scheduler's stale-QUEUED detection. The idempotency check in `reserveEmailCapacity` (findFirst on existing RESERVED reservation) prevents duplicate reservations even if the job is processed concurrently.

**Existing protections against tight loops:**
- `scheduleDueJobs` uses an atomic `UPDATE ... SET status = 'QUEUED' WHERE id IN (...)` — two cron ticks can't pick up the same job
- Explicit `ack()` after processing prevents message re-delivery (push-based consumer)
- `max_retries` (default 3) limits queue-level retry attempts before DLQ/deletion
- Cron interval (typically 1 min) bounds retry frequency
- Idempotency check prevents duplicate reservations

**Scheduler behavior verified against code:**
- `EmailJob.updated_at` has `@updatedAt` — Prisma automatically sets it to `now()` on every update. When consumer sets `status: 'QUEUED'`, `updated_at` is updated. ✓
- Stale-QUEUED query: `email_jobs.updated_at <= now() - interval '10 minutes'` — correct timestamp, 10-min threshold. ✓
- Atomic UPDATE in `scheduleDueJobs` with `AND status IN ('SCHEDULED', 'RETRY_WAIT', 'QUEUED')` — another worker can't pick up the same job concurrently. ✓
- Cloudflare Queue duplicate delivery — push-based consumer protections verified (15-min wall time, explicit `ack()`, `max_retries`, idempotency check). No `visibility_timeout` needed — that property is pull-based only. See Section 0.1.
- No repeated enqueue — once a job is QUEUED, it won't be re-picked until 10 minutes pass (stale-QUEUED detection). ✓

**Reservation quantity assumption:** Every `EmailSendReservation` represents exactly **1 email** — counters always increment/decrement by 1 (`increment: 1`), and reservations are keyed by `(email_job_id, attempt_number)` with a 1:1 relationship to email jobs. The check `sent + reserved >= limit` is correct under this assumption. If batch sending is ever added, the check must become `sent + reserved + requestedCount > limit`. Document and enforce this 1:1 assumption in code comments.

**Consumer failure handling for P2034 exhaustion (verified against `lib/jobs/consumer.ts` + `worker/index.ts`):**
- Consumer sets job to `QUEUED` (not SENT) — does not mark as successfully processed ✓
- Queue message is `ack()`'d after `processQueueJob` returns — by design, DB is source of truth, not queue. The scheduler re-enqueues based on DB state. ✓
- Job state updated atomically via single `prisma.emailJob.update()` ✓
- **Logging:** Log P2034 exhaustion at `warn` level with `jobId`, `attemptNumber`, and `attempt` count. Rate-limit if flooding occurs.
- **Indefinite retry protection:** The 10-minute backoff prevents tight loops. If P2034 persists (systemic DB problem), the job cycles QUEUED → re-pick → fail → QUEUED every 10 minutes. This is acceptable because: (1) P2034 under normal load is rare and transient, (2) persistent P2034 indicates a systemic problem requiring admin intervention, (3) the 10-min backoff prevents log flooding. **Future enhancement:** add max consecutive P2034 count (e.g., 5) → set to FAILED with internal error message.

**P2034 retry lifecycle — precise implementation flow:**

```
P2034 (TransactionConflictError) caught inside reserveEmailCapacity
    ↓
Retry complete transaction up to MAX_ATTEMPTS = 3
    ↓
All 3 attempts fail (P2034 on each)
    ↓
Return { success: false, reason: '[QUOTA_TRANSACTION_CONFLICT] ...' }
    ↓ (back in consumer)
Consumer detects isTransientError(reason) === true
    ↓
Update job: prisma.emailJob.update({ status: 'QUEUED' })
    ↓
Do NOT update error_message (transient, not user-facing)
    ↓
Do NOT mark email as SENT or FAILED
    ↓
Acknowledge queue message: msg.ack()
    ↓ (DB is source of truth, not queue)
Scheduler's scheduleDueJobs picks up stale QUEUED jobs after 10 minutes
    ↓
Job re-enqueued → consumer retries → reserveEmailCapacity runs again
```

This flow ensures the email is never accidentally marked as failed or sent, and the 10-minute backoff prevents tight retry loops.

Each error message includes the structured code prefix and current usage/limit for context.

### Phase 3: Fix `getCampaignDailyUsage` (effective limit)

**File:** `lib/limits/email-limit-service.ts`

Change return value from raw `campaign.daily_limit` to `min(global, userLimit, campaign.daily_limit)`. This requires also fetching the user_id from the campaign to compute the user limit.

### Phase 4: Fix error message matching in retry endpoint + create shared error-codes module

**New file:** `lib/limits/error-codes.ts`
- Export `LIMIT_ERROR_CODES` constants (`[SYSTEM_DAILY_LIMIT]`, `[ACCOUNT_DAILY_LIMIT]`, `[CAMPAIGN_DAILY_LIMIT]`)
- Export `isLimitError(message: string | null): boolean` — matches code prefixes AND legacy `'Daily email limit reached'` string
- Export `stripErrorCode(message: string): string` — removes `[CODE] ` prefix for UI display; leaves legacy messages unchanged

**File:** `app/api/emails/[id]/retry/route.ts`
- Replace substring match with `isLimitError(job.error_message)` from the shared module

**Files:** `components/emails/EmailList.tsx`, `app/(dashboard)/campaigns/[id]/page.tsx`
- Use `stripErrorCode` before displaying `error_message` in the UI

### Phase 5: Update tests

**Files:**
- `tests/unit/limits/email-limit-service.test.ts` — update for independent checks + default fallback
- `tests/unit/limits/daily-usage-read.test.ts` — update for effective campaign limit
- `tests/integration/api/emails-retry.test.ts` — update for new error code prefixes
- `tests/unit/limits/email-limit-service-coverage.test.ts` — update if affected
- `tests/unit/limits/quota-crash-safe.test.ts` — update if affected

**Additional test scenarios to add:**

| Test | Expected result |
|------|----------------|
| Global limit reached | Reject with `[SYSTEM_DAILY_LIMIT]` error |
| Account limit reached | Reject with `[ACCOUNT_DAILY_LIMIT]` error |
| Campaign limit reached | Reject with `[CAMPAIGN_DAILY_LIMIT]` error |
| User sends across multiple campaigns | Account usage is shared, campaign usage is independent |
| Campaign A reaches its limit | Campaign B remains independently available |
| Null user override | Uses current default value |
| Admin changes default | Runtime fallback updates immediately for no-override users |
| Global limit lower than account limit | System limit blocks when reached |
| Concurrent reservations, same account (real PostgreSQL) | No quota overrun under `Serializable` isolation |
| Concurrent reservations, different accounts sharing system limit (real PostgreSQL) | No quota overrun |
| Concurrent reservations, same campaign (real PostgreSQL) | No quota overrun |
| Usage row creation race (real PostgreSQL) | Two transactions both `upsert` same row — one aborts, retry succeeds |
| P2034 retry exhaustion | Returns safe failure after max attempts, no partial reservation, job set to QUEUED (10-min backoff) |
| P2034 exhaustion not treated as limit error | `isLimitError` returns false for `[QUOTA_TRANSACTION_CONFLICT]`, manual retry allowed |
| P2034 no tight loop | Job set to QUEUED, not SCHEDULED — scheduler only re-picks after 10 min stale timeout |
| Concurrent same job+attempt (real PostgreSQL) | One succeeds, other finds existing reservation or retries via P2034 |
| Post-commit retry (real PostgreSQL) | Retrying after committed reservation does not increment counters |
| Counter non-negativity (real PostgreSQL) | Double-release or double-commit does not decrement below zero |
| DB value 0 not replaced by fallback | `global_daily_email_limit = 0` → all sends blocked (NOT fallback to 500). Only missing settings row → fallback. |
| Reservation is always 1 email | `increment: 1` on all counters, keyed by `(email_job_id, attempt_number)` — 1:1 with email jobs |
| Reservation release | Reserved capacity is restored correctly on all three counters |
| Reservation commit | Sent and reserved counters remain consistent on all three counters |
| Retry after limit error (new code prefix) | Manual retry blocked with helpful message |
| Retry after legacy error (`Daily email limit reached.`) | Manual retry still blocked (backward compatibility) |
| No campaign limit (`daily_limit = null`) | Campaign-specific check is skipped |
| Error code prefix stripping | UI displays message without `[CODE] ` prefix |
| Malformed error message (no code, not legacy) | `isLimitError` returns false, retry allowed |
| **limitingScope: global and account tied** (Global=50, Account=50, Campaign=100) | `limitingScope = 'ACCOUNT'` (tie-break: account is more user-relevant) |
| **limitingScope: account equals campaign** (Global=500, Account=20, Campaign=20) | `limitingScope = null` (effective == campaignLimit, no note needed) |
| **limitingScope: global equals campaign** (Global=20, Account=50, Campaign=20) | `limitingScope = null` (effective == campaignLimit, no note needed) |
| **limitingScope: campaign is effective** (Global=500, Account=20, Campaign=2) | `limitingScope = null` (campaign limit is the binding constraint, card shows it) |
| **limitingScope: no campaign limit** (Global=500, Account=20, Campaign=null) | `limitingScope = null` (no campaign limit configured) |
| **limitingScope: global is 0** (Global=0, Account=20, Campaign=10) | `limitingScope = 'SYSTEM'` (effective=0 < 10, global is the cap) |
| **limitingScope: account is 0** (Global=500, Account=0, Campaign=10) | `limitingScope = 'ACCOUNT'` (effective=0 < 10, account is the cap) |
| **DB state: no quota overrun** (real PostgreSQL, concurrent requests) | Final `sent_count + reserved_count <= limit` on all three counters |
| **DB state: exactly one reservation** (real PostgreSQL, same job+attempt) | Exactly one `EmailSendReservation` row exists for `(email_job_id, attempt_number)` |
| **DB state: no partial increments** (real PostgreSQL, transaction failure) | All three counters unchanged after failed transaction |
| **DB state: counters never negative** (real PostgreSQL, double-release/commit) | `reserved_count >= 0` and `sent_count >= 0` on all tables |
| **DB state: correct values after commit** (real PostgreSQL) | `sent_count` incremented, `reserved_count` decremented on all three tables |
| **DB state: correct values after release** (real PostgreSQL) | `reserved_count` decremented on all three tables, `sent_count` unchanged |

### Phase 6: Verification

Run all four gates:
1. `npx tsc --noEmit`
2. `npx eslint`
3. `npx vitest run`
4. `npx next build`

---

## 5. What does NOT change

- **Schema** — no migrations needed. All columns already exist.
- **Usage tables** — `emailUsageDaily`, `campaignUsageDaily`, `systemUsageDaily` stay as-is.
- **Reservation lifecycle** — RESERVED → COMMITTED/RELEASED stays as-is. Release/commit functions unchanged (they already decrement/increment all three counters correctly).
- **Kill switch** — `email_sending_enabled` stays as-is.
- **Scheduling** — `campaignEmailTime` (pacing at scheduling time) stays as-is. This is separate from runtime enforcement.
- **Admin settings UI** — the three fields (global, default, enabled) stay. The form already has correct help text.
- **Campaign wizard** — the "Emails per day" input and validation stay. The help text already shows used/remaining.
- `UsageProgress` component — stays as-is. It already shows one effective limit per context.
- **Timezone** — `utcToday()` stays as-is (UTC midnight). All users share the same UTC reset boundary.
- **Validation** — `adminSettingsSchema` and `adminUpdateUserSchema` stay as-is (already reject 0/negative via `.positive()`).

---

## 6. Files to modify

| File | Change |
|------|--------|
| `lib/limits/email-limit-service.ts` | Fix `getEffectiveDailyEmailLimit` (default fallback, explicit null checks not truthy), fix `reserveEmailCapacity` (independent checks + `Serializable` isolation + bounded P2034 retry loop + `[QUOTA_TRANSACTION_CONFLICT]` on exhaustion), fix `getCampaignDailyUsage` (effective limit + `limitingScope`), add error code prefixes |
| `lib/limits/error-codes.ts` | **NEW** — centralized error codes, `isLimitError` helper (with legacy backward compat, excludes `[QUOTA_TRANSACTION_CONFLICT]`), `isTransientError` helper, `stripErrorCode` helper |
| `lib/jobs/consumer.ts` | Distinguish limit errors (→ RETRY_WAIT) from P2034 exhaustion (→ set QUEUED, never SCHEDULED or RETRY_WAIT, log internally) |
| `app/api/emails/[id]/retry/route.ts` | Use `isLimitError` from shared module instead of substring match |
| `components/emails/EmailList.tsx` | Use `stripErrorCode` before displaying error_message |
| `app/(dashboard)/campaigns/[id]/page.tsx` | Use `stripErrorCode` before displaying error_message |
| `tests/unit/limits/email-limit-service.test.ts` | Update for independent checks + default fallback + P2034 retry |
| `tests/unit/limits/daily-usage-read.test.ts` | Update for effective campaign limit |
| `tests/unit/limits/error-codes.test.ts` | **NEW** — tests for `isLimitError`, `stripErrorCode`, legacy compat, malformed messages |
| `tests/integration/api/emails-retry.test.ts` | Update for new error code prefixes + legacy backward compat |
| `tests/unit/limits/email-limit-service-coverage.test.ts` | Update if affected |
| `tests/unit/limits/quota-crash-safe.test.ts` | Update if affected |
| `tests/integration/db/` (new file) | Concurrent reservation tests with real PostgreSQL — same account, different accounts, same campaign, usage row creation race, P2034 retry exhaustion |

---

## 7. Example scenario after fix

**Setup:** Global=500, Default=20, User override=null (uses default=20), Campaign daily_limit=2

**User sends 1 email from Campaign B (different campaign):**
- System check: 0 < 500 ✓
- Account check: 0 < 20 ✓
- Campaign B check: 0 < (B's limit) ✓
- All pass → email sent
- User usage: 1 sent. Campaign B usage: 1 sent.

**User sends email from Campaign A (limit=2):**
- System check: 1 < 500 ✓
- Account check: 1 < 20 ✓
- Campaign A check: 0 < 2 ✓
- All pass → email sent
- User usage: 2 sent. Campaign A usage: 1 sent.

**User sends 2nd email from Campaign A:**
- System check: 2 < 500 ✓
- Account check: 2 < 20 ✓
- Campaign A check: 1 < 2 ✓
- All pass → email sent
- User usage: 3 sent. Campaign A usage: 2 sent.

**User sends 3rd email from Campaign A:**
- System check: 3 < 500 ✓
- Account check: 3 < 20 ✓
- Campaign A check: 2 >= 2 ✗ → FAIL: "Campaign daily limit reached (2 of 2). Resets at midnight UTC."
- Email goes to RETRY_WAIT, next attempt at midnight UTC

**Admin clears user's override (sets to null):**
- User limit becomes default (20), NOT global (500)
- No sudden jump to 500

**20 emails sent across all campaigns, user tries another:**
- System check: 20 < 500 ✓
- Account check: 20 >= 20 ✗ → FAIL: "Account daily limit reached (20 of 20). Resets at midnight UTC."
- Email goes to RETRY_WAIT

**500 emails sent system-wide across all users, any user tries another:**
- System check: 500 >= 500 ✗ → FAIL: "System daily limit reached (500 of 500). Try again tomorrow."
- Email goes to RETRY_WAIT

---

## 8. External review feedback evaluation

### Round 1

A friend reviewed this plan and gave feedback. Each point was evaluated against the actual codebase:

| Feedback point | Verdict | Action taken |
|---------------|---------|-------------|
| **Concurrency safety not specified** | ✅ Valid — code uses `READ COMMITTED` (default), race condition confirmed | Added Section 3.9: use `Serializable` isolation level |
| **Campaign display confusion when effective < configured** | ✅ Valid — user sets 100 but sees 20 | Added note in Section 3.8: show "ⓘ Limited by your account daily limit of 20" |
| **Default behavior needs clear policy** | ✅ Valid — changing default should affect no-override users | Added Section 3.10: documents all value semantics + admin-changes-default behavior |
| **String matching is fragile** | ✅ Valid — substring match breaks if wording changes | Added Section 3.5: structured `[CODE]` prefix in error messages; Section 3.6: retry matches on code prefix |
| **Check priority order should be documented** | ✅ Valid — system → account → campaign is intentional | Documented in Section 3.3 |
| **Reservation lifecycle consistency** | ✅ Valid — need explicit tests | Added to Phase 5 test list: release/commit counter consistency on all three tables |
| **Timezone/reset behavior** | ✅ Valid — should be explicit | Confirmed `utcToday()` uses UTC midnight; documented in Section 3.10 |
| **Additional test scenarios** | ✅ Valid — concurrency, cross-campaign, admin-changes-default | Added 14 test scenarios to Phase 5 |
| **Sections 3.9 and 3.10** | ✅ Valid | Added both sections |
| **Different implementation order** | ❌ No change needed — friend's order is essentially the same as the plan's | — |

### Round 2

The friend reviewed the updated plan and gave a second round of feedback:

| Feedback point | Verdict | Action taken |
|---------------|---------|-------------|
| **Prisma does NOT auto-retry P2034** | ✅ Valid — `maxWait`/`timeout` control slot waiting/execution, NOT serialization retries. Codebase catches P2034 in `create.ts` but maps to error, doesn't retry | Fixed Section 3.9 + Phase 2: explicit bounded retry loop (max 3 attempts) |
| **Verify complete concurrency design** | ✅ Valid — need specific scenarios per quota scope | Added 6 concurrency scenarios to Section 3.9 + 5 concurrency tests to Phase 5 |
| **Hardcoded fallback safety** | Partially valid — 0 is correctly handled (means "no emails", not "use 500"). Hardcoded fallback only for missing settings row | Added explicit documentation in Section 3.10 |
| **Centralize error codes in shared module** | ✅ Valid — avoids inline matching, ensures consistency | Added `lib/limits/error-codes.ts` to Section 3.5, Phase 4, and files table |
| **Legacy backward compatibility** | ✅ Valid — existing emails have old error string without code prefix | `isLimitError` helper matches both new codes AND legacy `'Daily email limit reached'` |
| **Tests for malformed/missing/legacy messages** | ✅ Valid | Added to Phase 5 test list: legacy compat, malformed message, code stripping |
| **Campaign UI: global cap case** | ✅ Valid — note should be accurate regardless of which tier caps | Note says "Limited by your account daily limit of {min(global, userLimit)}" — always accurate from user's perspective |

### Round 3

The friend reviewed the updated plan and gave a third round of feedback:

| Feedback point | Verdict | Action taken |
|---------------|---------|-------------|
| **P2034 retry count terminology inconsistent** | ✅ Valid — `MAX_RETRIES=3` with `attempt<=MAX_RETRIES` = 3 total, but "retries" implies 3 after first = 4 total | Changed to `MAX_ATTEMPTS = 3` consistently throughout |
| **Campaign UI limiting scope needs precision** | ✅ Valid — if global=15 caps below account=20, saying "Limited by account limit of 20" is wrong | Added `limitingScope: 'SYSTEM'\|'ACCOUNT'\|'CAMPAIGN'\|null` to `getCampaignDailyUsage` return type. UI shows note only for ACCOUNT scope; SYSTEM scope shows no note (users don't know about system limits) |
| **Verify DB constraints before implementation** | ✅ Valid — verified all unique constraints exist in schema. No CHECK on counter non-negativity | Added DB constraint verification to Section 3.9 with all 4 constraints confirmed. Added counter non-negativity requirement + tests |
| **Handle retry exhaustion explicitly** | ✅ Valid — P2034 exhaustion is transient, NOT a limit error. Consumer currently sends ALL failures to RETRY_WAIT (tomorrow midnight) | Added `[QUOTA_TRANSACTION_CONFLICT]` error code. Consumer distinguishes: limit errors → RETRY_WAIT (tomorrow), P2034 exhaustion → set QUEUED (never SCHEDULED or RETRY_WAIT, scheduler retries after 10-min stale-queued period). `isLimitError` excludes this code. Added `isTransientError` helper. Added `consumer.ts` to files-to-modify |
| **Validate retry idempotency behavior** | ✅ Valid — need explicit tests for concurrent same-job, post-commit retry, failed-transaction atomicity | Added 3 test scenarios: concurrent same job+attempt, post-commit retry no double-count, counter non-negativity |

### Round 4

The friend reviewed the updated plan and gave a fourth round of feedback with two final points:

| Feedback point | Verdict | Action taken |
|---------------|---------|-------------|
| **P2034 job state may cause repeated processing (tight loop)** | ✅ Valid — if left as SCHEDULED, next cron tick (1 min) immediately re-picks it. But existing protections exist: atomic UPDATE in `scheduleDueJobs`, cron interval, queue visibility timeout, idempotency check | Changed P2034 exhaustion to set job to `QUEUED` (not SCHEDULED). Scheduler only re-picks QUEUED jobs after 10-min stale timeout — natural backoff without tight loop. Documented all 4 existing protections in Phase 2. Added "P2034 no tight loop" test |
| **limitingScope: null needs clearer definition + tie-breaking** | ✅ Valid — "no capping" is confusing when campaign limit IS a constraint. Also need tie-breaking when limits are equal | Updated Section 3.8: `null` = "no campaign limit configured, OR effective equals campaign limit". Added explicit tie-breaking rules: `global == userLimit < campaignLimit` → ACCOUNT; `global == campaignLimit` or `userLimit == campaignLimit` → null (no note needed) |

### Round 5

The friend reviewed the updated plan and gave a fifth round of feedback with 5 final points:

| Feedback point | Verdict | Action taken |
|---------------|---------|-------------|
| **limitingScope: null still confusing** | ✅ Valid — null combines multiple meanings | Documented in Section 3.8: `null` means "no additional UI explanatory note is needed" — NOT "no limit is active." Covers: no campaign limit, effective equals campaign limit, or limits tied |
| **Scheduler behavior needs code-level verification** | ✅ Valid — verify updated_at, stale query, concurrent pickup, queue timeout, repeated enqueue | Verified all against code in Section 3.9: `@updatedAt` auto-sets now ✓, stale query correct ✓, atomic UPDATE prevents concurrent pickup ✓, push-based queue protections verified in Section 0.1 (no `visibility_timeout` needed), no repeated enqueue ✓ |
| **Limit checks should account for requested quantity** | ✅ Valid — document 1:1 assumption | Verified all counters use `increment: 1`, reservations keyed by `(email_job_id, attempt_number)`. Documented 1:1 assumption in Section 3.9. Added test to Phase 5 |
| **Clarify zero and missing settings behavior** | ✅ Valid — add test for DB value 0 | Added test to Phase 5: "DB value 0 not replaced by fallback — `global_daily_email_limit = 0` → all sends blocked, NOT fallback to 500" |
| **Consumer failure handling for P2034** | ✅ Valid — verify ack behavior, atomic update, logging, indefinite retry | Verified in Section 3.9: consumer sets QUEUED (not SENT) ✓, queue message acked by design (DB is source of truth) ✓, atomic update ✓. Added: warn-level logging, indefinite retry protection note (10-min backoff + future max consecutive count enhancement) |

### Round 6

The friend reviewed the updated plan and gave a sixth round of feedback with 3 final issues:

| Feedback point | Verdict | Action taken |
|---------------|---------|-------------|
| **`'CAMPAIGN'` still in UI table despite being removed from type** | ✅ Valid — the return type was `'SYSTEM' \| 'ACCOUNT' \| null` but the UI note table still had a `'CAMPAIGN'` row | Removed the `'CAMPAIGN'` row from the UI note table in Section 3.8. The type and table are now consistent: `'SYSTEM'`, `'ACCOUNT'`, `null` only |
| **`null` wording in UI table misleading** | ✅ Valid — "no capping (campaign limit is the only constraint)" is wrong because `null` also covers "campaign limit is the effective limit" and "limits are tied" | Updated `null` row to "No additional explanatory note is needed." — consistent with the definition earlier in Section 3.8. `'SYSTEM'` row also updated to match wording |
| **0-value contradiction between Section 1.2 and Section 3.10** | ✅ Valid — Section 1.2 said "null / 0 / missing is skipped" but Section 3.10 said "0 means no emails." Current code at `email-limit-service.ts:34,43` uses truthy checks (`if (limit && limit > 0)`) that DO skip 0 — so Section 1.2 was accurate about current behavior but contradicted the target | Labeled Section 1.2 as **Current behavior** vs **Target behavior**. Added implementation warning against truthy checks (`if (globalLimit)`) — must use explicit `null` checks (`if (globalLimit !== null)`). Referenced exact code lines (`:34`, `:43`) that need changing |

### Final Review (Round 7)

The friend gave final approval: "The plan is now well-structured and close to implementation-ready." All previous documentation issues confirmed resolved. Three pre-implementation checks flagged:

| Check | Status | Action taken |
|-------|--------|-------------|
| **Verify Cloudflare Queue duplicate delivery protection** | `wrangler.toml` uses push-based consumer — `visibility_timeout` is pull-based only and does NOT apply | Added Section 0.1: verified push-based protections (15-min wall time, explicit `ack()`, `max_retries`, idempotency check). No `wrangler.toml` change needed. Removed from files-to-modify |
| **Test with real PostgreSQL** | Concurrency tests cannot use mocked Prisma | Added Section 0.2: concurrency tests in `tests/integration/db/` with real isolated PostgreSQL. Already documented in Phase 5 test list |
| **Verify consumer state transitions** | P2034 exhaustion must set QUEUED, ack message, not overwrite error_message, not mark as sent | Added Section 0.3: explicit 4-point verification checklist + dedicated test in Phase 5 |

**Plan status changed to READY FOR IMPLEMENTATION.**

### Round 8

The friend reviewed the updated plan and gave 5 remaining issues:

| Feedback point | Verdict | Action taken |
|---------------|---------|-------------|
| **P2034 status wording inconsistent ("QUEUED/SCHEDULED" vs "QUEUED")** | ✅ Valid — 4 instances used "QUEUED/SCHEDULED" instead of just "QUEUED" | Fixed all 4 instances. P2034 exhaustion always sets QUEUED, never SCHEDULED or RETRY_WAIT. Updated error code table, Section 3.9, files-to-modify, and Round 3 feedback entry |
| **Queue visibility timeout needs implementation verification** | ✅ Valid — but `visibility_timeout` is pull-based only, NOT valid for push-based Worker consumers | Rewrote Section 0.1: verified against Cloudflare docs that push-based consumers use 15-min wall time limit + explicit `ack()` + `max_retries` + idempotency check. No `wrangler.toml` change needed. Removed `wrangler.toml` from files-to-modify |
| **limitingScope algorithm needs more test coverage** | ✅ Valid — tied/equal/0-value edge cases not covered | Added 7 test cases to Phase 5: global+account tied, account=campaign, global=campaign, campaign is effective, no campaign limit, global=0, account=0 |
| **Validate real transaction behavior, not just error result** | ✅ Valid — concurrency tests must verify final DB state | Added 6 DB state verification tests to Phase 5: no quota overrun, exactly one reservation, no partial increments, counters never negative, correct values after commit, correct values after release |
| **Clarify P2034 retry lifecycle** | ✅ Valid — need precise implementation flow | Added P2034 retry lifecycle flow diagram in Section 3.9: P2034 → retry ×3 → all fail → set QUEUED → don't update error_message → don't mark sent/failed → ack() → scheduler retries after 10 min |
