/**
 * SHA-256 fingerprint and request hash for campaign deduplication.
 *
 * Per docs/CAMPAIGN/_DEDUPLICATION.md §5.2/§5.8, all fingerprints/hashes use
 * SHA-256 lowercase 64-character hex over UTF-8 canonical JSON with:
 * - Explicitly ordered object keys
 * - Preserved contact/attachment order
 * - Sorted follow-up pairs
 * - UTC ISO dates
 * - Material nulls retained
 * - Omitted optional values normalized to their defaults
 */

/**
 * Compute SHA-256 hash of a UTF-8 string, returning lowercase 64-char hex.
 * Uses the Web Crypto API (available in Node 20+ and Cloudflare Workers).
 */
export async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Canonical JSON stringification: sorted object keys at all levels, no
 * whitespace, UTF-8. Arrays preserve order. `undefined` values are omitted;
 * `null` is retained (material nulls per §5.8).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (typeof value === 'object') {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      const val = (value as Record<string, unknown>)[key];
      if (val !== undefined) {
        result[key] = canonicalize(val);
      }
    }
    return result;
  }
  return value;
}

/**
 * Sort follow-up recipient pairs canonically: by contactId, then by
 * normalized recipientEmail. Used before hashing so order doesn't matter.
 */
export function sortResendPairs(
  pairs: ReadonlyArray<{ contactId: string; recipientEmail: string }>
): Array<{ contactId: string; recipientEmail: string }> {
  return [...pairs]
    .map((p) => ({
      contactId: p.contactId.toLowerCase(),
      recipientEmail: p.recipientEmail.trim().toLowerCase(),
    }))
    .sort((a, b) => {
      if (a.contactId < b.contactId) return -1;
      if (a.contactId > b.contactId) return 1;
      if (a.recipientEmail < b.recipientEmail) return -1;
      if (a.recipientEmail > b.recipientEmail) return 1;
      return 0;
    });
}

/**
 * Input to `computePreviewFingerprint`. Represents the material planned send
 * and meaningful consent facts (§5.2/§5.8). Incidental history statuses,
 * last-sent dates, and timestamps are excluded.
 */
export interface PreviewFingerprintInput {
  templateId: string;
  emailAccountId: string;
  attachmentIds: string[];
  contactIds: string[];
  resendRecipients: Array<{ contactId: string; recipientEmail: string }>;
  missingValueAction: 'exclude' | 'continue';
  unknownTokenAction: 'fix' | 'continue';
  /** Ordered eligible contact/address pairs with prepared content. */
  eligibleRecipients: Array<{
    contactId: string;
    recipientEmail: string;
    subject: string;
    bodyText: string;
    bodyHtml: string | null;
  }>;
  /** Whether each included recipient is a previous recipient (consent fact). */
  includedPreviousCount: number;
  includedWithoutPreviousSendCount: number;
  /** SENT job IDs for explicitly chosen follow-up recipients (§5.8). */
  followUpSentJobIds: string[];
}

/**
 * Compute the preview fingerprint — a SHA-256 digest over the canonical
 * representation of the material planned send (§5.2).
 */
export async function computePreviewFingerprint(
  input: PreviewFingerprintInput
): Promise<string> {
  const canonical = canonicalJson({
    v: 1,
    templateId: input.templateId,
    emailAccountId: input.emailAccountId,
    attachmentIds: input.attachmentIds,
    contactIds: input.contactIds,
    resendRecipients: sortResendPairs(input.resendRecipients),
    missingValueAction: input.missingValueAction,
    unknownTokenAction: input.unknownTokenAction,
    eligibleRecipients: input.eligibleRecipients.map((r) => ({
      contactId: r.contactId,
      recipientEmail: r.recipientEmail.trim().toLowerCase(),
      subject: r.subject,
      bodyText: r.bodyText,
      bodyHtml: r.bodyHtml,
    })),
    includedPreviousCount: input.includedPreviousCount,
    includedWithoutPreviousSendCount: input.includedWithoutPreviousSendCount,
    followUpSentJobIds: [...input.followUpSentJobIds].sort(),
  });
  return sha256Hex(canonical);
}

/**
 * Input to `computeRequestHash`. Represents all canonical semantic creation
 * inputs (§6.3). Does NOT include `idempotency_key` itself.
 */
export interface RequestHashInput {
  name: string;
  templateId: string;
  emailAccountId: string;
  attachmentIds: string[];
  contactIds: string[];
  startAt: string;
  timezone: string;
  intervalMinutes: number;
  dailyLimit: number | null;
  resendRecipients: Array<{ contactId: string; recipientEmail: string }>;
  missingValueAction: 'exclude' | 'continue';
  unknownTokenAction: 'fix' | 'continue';
  previewFingerprint: string;
}

/**
 * Compute the request hash — SHA-256 over canonical semantic creation inputs
 * (§6.3). Used to detect same-key/different-payload conflicts.
 */
export async function computeRequestHash(input: RequestHashInput): Promise<string> {
  const canonical = canonicalJson({
    name: input.name,
    templateId: input.templateId,
    emailAccountId: input.emailAccountId,
    attachmentIds: input.attachmentIds,
    contactIds: input.contactIds,
    startAt: input.startAt,
    timezone: input.timezone,
    intervalMinutes: input.intervalMinutes,
    dailyLimit: input.dailyLimit,
    resendRecipients: sortResendPairs(input.resendRecipients),
    missingValueAction: input.missingValueAction,
    unknownTokenAction: input.unknownTokenAction,
    previewFingerprint: input.previewFingerprint,
  });
  return sha256Hex(canonical);
}
