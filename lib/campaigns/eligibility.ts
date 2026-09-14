/**
 * Campaign eligibility computation — the shared policy service.
 *
 * Implements docs/CAMPAIGN/_DEDUPLICATION.md §3-§5. Called by the pre-check,
 * recipient-status, and creation endpoints. Returns both a safe public summary
 * and an internal prepared snapshot for job generation.
 */

import { PrismaClient } from '../generated/prisma/client';
import type { TransactionClient } from '@/lib/db';
import {
  VARIABLE_PATTERN,
  SUPPORTED_TEMPLATE_VARIABLES,
  replaceTemplateVariables,
} from '@/lib/email/template';
import {
  buildTemplateContact,
  type ContactFieldDefinition,
  type ContactFieldValueRow,
} from '@/lib/email/template-contact';
import { campaignEmailTime } from '@/lib/scheduling/campaign';
import {
  normalizeEmail,
  buildCreationKey,
} from './normalize';
import {
  decideEligibility,
  classifyForRowStatus,
  emptyExcludedByReason,
  incrementReason,
  POLICY_VERSION,
  type PrimaryReason,
  type ExcludedByReason,
  type AddressHistorySummary,
  type RecipientClassification,
  PENDING_JOB_STATUSES,
} from './policy';
import { ResendEntryInvalidError } from '@/lib/errors';

/** Field definition with label — extends ContactFieldDefinition for missing-value detection. */
type FieldDefinitionWithLabel = ContactFieldDefinition & { label: string };

/** A database client — either the full PrismaClient or a transaction client. */
type DbClient = PrismaClient | TransactionClient;

// ─── Public types ────────────────────────────────────────────────────────

export type MissingValueAction = 'exclude' | 'continue';
export type UnknownTokenAction = 'fix' | 'continue';

export interface ResendEntry {
  contactId: string;
  recipientEmail: string;
}

/** Public recipient row in the pre-check response (§5.2). */
export interface PublicRecipientRow {
  contactId: string;
  included: boolean;
  followUpSelected: boolean;
  canSelectFollowUp: boolean;
  primaryReason: PrimaryReason | null;
  representativeContactId?: string;
  lastSentAt?: string | null;
  pendingScheduledAt?: string | null;
  name: string | null;
  recipientEmail: string;
  hasPreviousSend: boolean;
}

/** Public pre-check summary (§5.2). */
export interface EligibilitySummary {
  policyVersion: number;
  checkedAt: string;
  selectedCount: number;
  eligibleCount: number;
  excludedCount: number;
  excludedByReason: ExcludedByReason;
  includedPreviousCount: number;
  includedWithoutPreviousSendCount: number;
  blockedByUnknownTokens: boolean;
  recipients: PublicRecipientRow[];
  missingValues: MissingValueEntry[];
  unknownTokens: string[];
  affectedContactCount: number;
  totalContactCount: number;
}

export interface MissingValueEntry {
  token: string;
  label: string;
  contactCount: number;
  contactIds: string[];
}

/** Row-status response item (§5.4). */
export interface RecipientStatusRow {
  contactId: string;
  classification: RecipientClassification;
  lastSentAt: string | null;
  pendingScheduledAt: string | null;
}

// ─── Internal prepared snapshot ──────────────────────────────────────────

/** A single prepared job snapshot for the creation transaction. */
export interface PreparedJob {
  contactId: string;
  toEmail: string;
  normalizedEmail: string;
  subject: string;
  body: string;
  bodyHtml: string | null;
  scheduledAt: Date;
  creationKey: string;
}

/** Internal result: public summary + prepared snapshot for job generation. */
export interface EligibilityResult {
  summary: EligibilitySummary;
  preparedJobs: PreparedJob[];
  /** Normalized resend entries validated against the selection. */
  validatedResendRecipients: ResendEntry[];
  /** SENT job IDs for explicitly chosen follow-up recipients (§5.8). */
  followUpSentJobIds: string[];
}

// ─── Input ───────────────────────────────────────────────────────────────

export interface EligibilityInput {
  userId: string;
  templateId: string;
  emailAccountId: string;
  contactIds: string[];
  attachmentIds: string[];
  resendRecipients: ResendEntry[];
  missingValueAction: MissingValueAction;
  unknownTokenAction: UnknownTokenAction;
  /** Schedule params for prepared job snapshots. */
  startAt: Date;
  timezone: string;
  intervalMinutes: number;
  dailyLimit: number | null;
  /** Campaign ID — only set during creation, not pre-check. */
  campaignId?: string;
}

// ─── History query ───────────────────────────────────────────────────────

/**
 * Query matching job history for a set of normalized addresses. Set-based —
 * one query for all addresses, not one per contact (§6.5).
 *
 * Uses Prisma's standard query builder (not raw SQL) for compatibility with
 * the Neon serverless adapter. Address matching is done in JavaScript using
 * `normalizeEmail` (equivalent to PostgreSQL `lower(btrim(...))`).
 */
async function queryAddressHistory(
  db: DbClient,
  userId: string,
  templateId: string,
  emailAccountId: string,
  normalizedAddresses: string[]
): Promise<Map<string, AddressHistorySummary>> {
  if (normalizedAddresses.length === 0) {
    return new Map();
  }

  const historyMatchStatuses = [
    'SENT', 'SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT', 'DELIVERY_UNKNOWN',
  ] as const;

  const jobs = await db.emailJob.findMany({
    where: {
      user_id: userId,
      template_id: templateId,
      email_account_id: emailAccountId,
      status: { in: [...historyMatchStatuses] },
    },
    select: {
      id: true,
      to_email: true,
      status: true,
      sent_at: true,
      scheduled_at: true,
    },
  });

  const historyByAddress = new Map<string, AddressHistorySummary>();
  for (const addr of normalizedAddresses) {
    historyByAddress.set(addr, {
      hasSent: false,
      hasPending: false,
      hasDeliveryUnknown: false,
      lastSentAt: null,
      pendingScheduledAt: null,
      sentJobIds: [],
    });
  }

  const normalizedSet = new Set(normalizedAddresses);
  for (const job of jobs) {
    const normalizedEmail = normalizeEmail(job.to_email);
    if (!normalizedSet.has(normalizedEmail)) continue;

    const summary = historyByAddress.get(normalizedEmail);
    if (!summary) continue;

    if (job.status === 'SENT') {
      summary.hasSent = true;
      summary.sentJobIds.push(job.id);
      if (job.sent_at && (!summary.lastSentAt || job.sent_at > summary.lastSentAt)) {
        summary.lastSentAt = job.sent_at;
      }
    } else if (job.status === 'DELIVERY_UNKNOWN') {
      summary.hasDeliveryUnknown = true;
    } else if ((PENDING_JOB_STATUSES as readonly string[]).includes(job.status)) {
      summary.hasPending = true;
      if (job.scheduled_at && (!summary.pendingScheduledAt || job.scheduled_at < summary.pendingScheduledAt)) {
        summary.pendingScheduledAt = job.scheduled_at;
      }
    }
  }

  return historyByAddress;
}

// ─── Missing value detection (pure, from loaded data) ────────────────────

/**
 * Detect unknown tokens and missing custom-field values from loaded snapshots.
 * Pure function — no database access. Separated from `runMissingValueCheck`
 * so it can run inside the creation transaction on freshly-loaded data.
 */
export function detectMissingValues(
  templateSubject: string,
  templateBody: string,
  contacts: ReadonlyArray<{
    id: string;
    name: string | null;
    email: string;
    contact_field_values: ContactFieldValueRow[];
  }>,
  fieldDefinitions: FieldDefinitionWithLabel[]
): {
  missingValues: MissingValueEntry[];
  unknownTokens: string[];
  affectedContactIds: Set<string>;
} {
  const fieldByToken = new Map(fieldDefinitions.map((f) => [f.name, f]));
  const knownTokens = new Set<string>([...SUPPORTED_TEMPLATE_VARIABLES, ...fieldByToken.keys()]);

  const subjectTokens = new Set(
    [...templateSubject.matchAll(VARIABLE_PATTERN)].map((m) => m[1].toLowerCase())
  );
  const bodyTokens = new Set(
    [...templateBody.matchAll(VARIABLE_PATTERN)].map((m) => m[1].toLowerCase())
  );
  const allTokens = new Set([...subjectTokens, ...bodyTokens]);

  const unknownTokens: string[] = [];
  const knownFieldTokens: Array<{ token: string; label: string }> = [];
  for (const token of allTokens) {
    if (knownTokens.has(token)) {
      if (fieldByToken.has(token)) {
        knownFieldTokens.push({ token, label: fieldByToken.get(token)!.label });
      }
    } else {
      unknownTokens.push(`{{${token}}}`);
    }
  }

  if (knownFieldTokens.length === 0) {
    return { missingValues: [], unknownTokens, affectedContactIds: new Set() };
  }

  const fieldIdByToken = new Map(fieldDefinitions.map((f) => [f.name, f.id]));
  const missingValues: MissingValueEntry[] = [];

  for (const { token, label } of knownFieldTokens) {
    const missingContactIds: string[] = [];
    for (const contact of contacts) {
      const fieldId = fieldIdByToken.get(token);
      if (!fieldId) continue;
      const value = contact.contact_field_values.find((v) => v.field_id === fieldId)?.value;
      if (value == null || value.trim() === '') {
        missingContactIds.push(contact.id);
      }
    }
    if (missingContactIds.length > 0) {
      missingValues.push({ token, label, contactCount: missingContactIds.length, contactIds: missingContactIds });
    }
  }

  const affectedContactIds = new Set<string>();
  for (const mv of missingValues) {
    for (const id of mv.contactIds) affectedContactIds.add(id);
  }

  return { missingValues, unknownTokens, affectedContactIds };
}

// ─── Main eligibility computation ────────────────────────────────────────

/**
 * Compute eligibility for a campaign selection. Returns the public summary
 * and an internal prepared snapshot for job generation.
 *
 * This is the single source of truth for eligibility — called by pre-check,
 * recipient-status, and creation. All three must produce consistent results.
 */
export async function computeEligibility(
  db: DbClient,
  input: EligibilityInput
): Promise<EligibilityResult> {
  const {
    userId,
    templateId,
    emailAccountId,
    contactIds,
    resendRecipients,
    missingValueAction,
    unknownTokenAction,
    startAt,
    intervalMinutes,
    dailyLimit,
    campaignId,
  } = input;

  // 1. Load contacts with field values (in submission order).
  const [contacts, fieldDefs] = await Promise.all([
    db.contact.findMany({
      where: { id: { in: contactIds }, user_id: userId },
      include: { contact_field_values: { select: { field_id: true, value: true } } },
    }),
    db.contactField.findMany({
      where: { user_id: userId },
      select: { id: true, name: true, label: true, field_type: true },
    }),
  ]);

  // Preserve submission order.
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const orderedContacts = contactIds
    .map((id) => contactById.get(id))
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  const fieldDefinitions = fieldDefs as FieldDefinitionWithLabel[];

  // 2. Load template.
  const template = await db.template.findFirst({
    where: { id: templateId, user_id: userId },
    select: { id: true, subject: true, body: true, body_text: true, body_html: true },
  });

  // If template not found, return empty eligibility (route handles ownership).
  const templateSubject = template?.subject ?? '';
  const templateBodyText = template?.body_text ?? template?.body ?? '';
  const templateBodyHtml = template?.body_html ?? null;

  // 3. Group by normalized email — first in order is the representative.
  const addressGroups = new Map<string, string[]>();
  for (const contact of orderedContacts) {
    const normalized = normalizeEmail(contact.email);
    const group = addressGroups.get(normalized) ?? [];
    group.push(contact.id);
    addressGroups.set(normalized, group);
  }
  const representativeByAddress = new Map<string, string>();
  const duplicateContacts = new Set<string>();
  for (const [normalizedEmail, groupIds] of addressGroups) {
    representativeByAddress.set(normalizedEmail, groupIds[0]);
    for (let i = 1; i < groupIds.length; i++) {
      duplicateContacts.add(groupIds[i]);
    }
  }

  // 4. Query history for all representative addresses (set-based).
  const normalizedAddresses = [...representativeByAddress.keys()];
  const historyByAddress = await queryAddressHistory(
    db, userId, templateId, emailAccountId, normalizedAddresses
  );

  // 5. Validate resend recipients — must be a subset of representative contacts.
  // Reject invalid entries instead of silently dropping (§5.3).
  const resendSet = new Map<string, boolean>();
  const validatedResendRecipients: ResendEntry[] = [];
  const invalidResendEntries: Array<{ contactId: string; recipientEmail: string; reason: string }> = [];
  for (const entry of resendRecipients) {
    const normalized = normalizeEmail(entry.recipientEmail);
    const representative = representativeByAddress.get(normalized);
    if (representative === undefined) {
      invalidResendEntries.push({ contactId: entry.contactId, recipientEmail: entry.recipientEmail, reason: 'Contact is not in the selected recipients.' });
    } else if (representative !== entry.contactId) {
      invalidResendEntries.push({ contactId: entry.contactId, recipientEmail: entry.recipientEmail, reason: 'Contact is a duplicate address, not the representative.' });
    } else {
      resendSet.set(entry.contactId, true);
      validatedResendRecipients.push(entry);
    }
  }
  if (invalidResendEntries.length > 0) {
    throw new ResendEntryInvalidError(
      'One or more follow-up recipients are invalid.',
      { invalidEntries: invalidResendEntries }
    );
  }

  // 6. Detect missing values on all contacts (pure function).
  const { missingValues, unknownTokens, affectedContactIds } = detectMissingValues(
    templateSubject,
    templateBodyHtml ?? templateBodyText,
    orderedContacts,
    fieldDefinitions
  );

  // 7. Classify each contact and build the recipient rows.
  let excludedByReason = emptyExcludedByReason();
  let eligibleCount = 0;
  let includedPreviousCount = 0;
  let includedWithoutPreviousSendCount = 0;
  const recipientRows: PublicRecipientRow[] = [];
  const preparedJobs: PreparedJob[] = [];

  for (const contact of orderedContacts) {
    const normalizedEmail = normalizeEmail(contact.email);
    const isDuplicate = duplicateContacts.has(contact.id);
    const representativeId = representativeByAddress.get(normalizedEmail);
    const isRepresentative = contact.id === representativeId;
    const history = historyByAddress.get(normalizedEmail) ?? {
      hasSent: false, hasPending: false, hasDeliveryUnknown: false,
      lastSentAt: null, pendingScheduledAt: null, sentJobIds: [],
    };
    const followUpSelected = resendSet.has(contact.id);
    const canSelectFollowUp = isRepresentative && history.hasSent && !history.hasPending && !history.hasDeliveryUnknown;

    let primaryReason: PrimaryReason | null = null;
    let included = false;

    if (isDuplicate) {
      primaryReason = 'DUPLICATE_ADDRESS';
      excludedByReason = incrementReason(excludedByReason, 'DUPLICATE_ADDRESS');
    } else {
      const decision = decideEligibility(history, followUpSelected);
      if (!decision.eligible && decision.reason) {
        primaryReason = decision.reason;
        excludedByReason = incrementReason(excludedByReason, decision.reason);
      } else if (decision.eligible && missingValueAction === 'exclude' && affectedContactIds.has(contact.id)) {
        primaryReason = 'MISSING_VALUES';
        excludedByReason = incrementReason(excludedByReason, 'MISSING_VALUES');
      } else {
        included = true;
        eligibleCount++;
        if (history.hasSent) {
          includedPreviousCount++;
        } else {
          includedWithoutPreviousSendCount++;
        }
      }
    }

    recipientRows.push({
      contactId: contact.id,
      included,
      followUpSelected,
      canSelectFollowUp,
      primaryReason,
      representativeContactId: isDuplicate ? representativeId : undefined,
      lastSentAt: history.lastSentAt?.toISOString() ?? null,
      pendingScheduledAt: history.pendingScheduledAt?.toISOString() ?? null,
      name: contact.name,
      recipientEmail: contact.email,
      hasPreviousSend: history.hasSent,
    });

    // Prepare job snapshot for included recipients.
    if (included && template) {
      const templateContact = buildTemplateContact(
        { name: contact.name, email: contact.email },
        contact.contact_field_values as ContactFieldValueRow[],
        fieldDefinitions
      );
      const subject = replaceTemplateVariables(templateSubject, templateContact);
      const body = replaceTemplateVariables(templateBodyText, templateContact);
      const bodyHtml = templateBodyHtml ? replaceTemplateVariables(templateBodyHtml, templateContact) : null;
      const jobIndex = preparedJobs.length;
      const scheduledAt = campaignEmailTime(startAt, jobIndex, intervalMinutes, dailyLimit);

      preparedJobs.push({
        contactId: contact.id,
        toEmail: contact.email,
        normalizedEmail,
        subject,
        body,
        bodyHtml,
        scheduledAt,
        creationKey: campaignId ? buildCreationKey(campaignId, contact.email) : '',
      });
    }
  }

  const blockedByUnknownTokens = unknownTokens.length > 0 && unknownTokenAction === 'fix';
  const selectedCount = contactIds.length;
  const excludedCount = selectedCount - eligibleCount;

  // Collect SENT job IDs for explicitly chosen follow-up recipients (§5.8).
  const followUpSentJobIds: string[] = [];
  for (const entry of validatedResendRecipients) {
    const normalized = normalizeEmail(entry.recipientEmail);
    const history = historyByAddress.get(normalized);
    if (history) {
      followUpSentJobIds.push(...history.sentJobIds);
    }
  }

  const summary: EligibilitySummary = {
    policyVersion: POLICY_VERSION,
    checkedAt: new Date().toISOString(),
    selectedCount,
    eligibleCount,
    excludedCount,
    excludedByReason,
    includedPreviousCount,
    includedWithoutPreviousSendCount,
    blockedByUnknownTokens,
    recipients: recipientRows,
    missingValues,
    unknownTokens,
    affectedContactCount: affectedContactIds.size,
    totalContactCount: selectedCount,
  };

  return { summary, preparedJobs, validatedResendRecipients, followUpSentJobIds };
}

// ─── Row-status only (for visible contact badges, §5.4) ──────────────────

/**
 * Classify visible contacts for row-level badges. Does NOT compute the full
 * selection summary — the pre-check endpoint is the single source for that.
 */
export async function computeRecipientStatus(
  db: DbClient,
  userId: string,
  templateId: string,
  emailAccountId: string,
  contactIds: string[]
): Promise<RecipientStatusRow[]> {
  const contacts = await db.contact.findMany({
    where: { id: { in: contactIds }, user_id: userId },
    select: { id: true, email: true },
  });

  const normalizedAddresses = contacts.map((c) => normalizeEmail(c.email));
  const historyByAddress = await queryAddressHistory(
    db, userId, templateId, emailAccountId, normalizedAddresses
  );

  const results = contacts.map((contact) => {
    const normalized = normalizeEmail(contact.email);
    const history = historyByAddress.get(normalized) ?? {
      hasSent: false, hasPending: false, hasDeliveryUnknown: false,
      lastSentAt: null, pendingScheduledAt: null, sentJobIds: [],
    };
    return {
      contactId: contact.id,
      classification: classifyForRowStatus(history),
      lastSentAt: history.lastSentAt?.toISOString() ?? null,
      pendingScheduledAt: history.pendingScheduledAt?.toISOString() ?? null,
    };
  });

  return results;
}
