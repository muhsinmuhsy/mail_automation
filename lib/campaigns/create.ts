/**
 * Transactional campaign creation service — the sole writer for campaign + jobs.
 *
 * Implements docs/CAMPAIGN/_DEDUPLICATION.md §6. Uses a per-user advisory lock
 * inside a short interactive transaction to serialize same-user creation.
 * Durable idempotency via CampaignSubmission receipts.
 */

import { getPrisma, type TransactionClient } from '@/lib/db';
import { createCampaignJobsFromSnapshot } from '@/lib/jobs/scheduler';
import { computeEligibility, type EligibilityInput, type EligibilitySummary } from './eligibility';
import { computeRequestHash, computePreviewFingerprint, type RequestHashInput } from './fingerprint';
import { normalizeEmail } from './normalize';
import {
  IdempotencyKeyReusedError,
  CampaignCreationBusyError,
  NoEligibleRecipientsError,
  RecipientActionRequiredError,
  RecipientPreviewChangedError,
  AppError,
} from '@/lib/errors';
import { logger } from '@/lib/logging/logger';

/** Result of a creation attempt. */
export interface CreationResult {
  campaignId: string;
  campaignName: string;
  status: 'created' | 'replayed';
  recipientSummary: EligibilitySummary;
  jobCount: number;
}

/** Input to `createCampaign`. */
export interface CreateCampaignInput extends EligibilityInput {
  name: string;
  idempotencyKey: string;
  previewFingerprint: string;
  /** Request ID for log correlation (passed from the route handler). */
  requestId?: string;
}

/** Stored receipt summary (subset of EligibilitySummary, §5.8). */
export interface StoredRecipientSummary {
  policyVersion: number;
  selectedCount: number;
  eligibleCount: number;
  excludedCount: number;
  excludedByReason: import('./policy').ExcludedByReason;
  includedPreviousCount: number;
  includedWithoutPreviousSendCount: number;
}

function extractStoredSummary(summary: EligibilitySummary): StoredRecipientSummary {
  return {
    policyVersion: summary.policyVersion,
    selectedCount: summary.selectedCount,
    eligibleCount: summary.eligibleCount,
    excludedCount: summary.excludedCount,
    excludedByReason: summary.excludedByReason,
    includedPreviousCount: summary.includedPreviousCount,
    includedWithoutPreviousSendCount: summary.includedWithoutPreviousSendCount,
  };
}

/**
 * Acquire a per-user transaction-scoped advisory lock.
 *
 * Uses `pg_advisory_xact_lock(hashtextextended('campaign-create:v1:<userId>', seed))`.
 * The lock is released on commit/rollback. Different users can create
 * concurrently; same-user creation is serialized (§6.1).
 */
async function acquireUserCreationLock(tx: TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`campaign-create:v1:${userId}`}::text, 42))
  `;
}

/**
 * Create a campaign with full deduplication guarantees, or replay an existing
 * submission. This is the sole campaign+job creation entry point (§5.1).
 *
 * Sequence (§6.2):
 * 1. Validate input (caller's responsibility).
 * 2. Start transaction; acquire per-user advisory lock.
 * 3. Look up existing submission by (user_id, idempotency_key). Replay if found.
 * 4. Load current data; compute eligibility.
 * 5. Compare fingerprint; reject if materially changed.
 * 6. Create campaign + jobs + submission receipt atomically.
 * 7. Commit and return.
 */
export async function createCampaign(
  input: CreateCampaignInput
): Promise<CreationResult> {
  const prisma = getPrisma();
  const requestId = input.requestId;
  const startTime = Date.now();

  // Compute request hash (outside transaction — deterministic).
  const requestHashInput: RequestHashInput = {
    name: input.name,
    templateId: input.templateId,
    emailAccountId: input.emailAccountId,
    attachmentIds: input.attachmentIds,
    contactIds: input.contactIds,
    startAt: input.startAt.toISOString(),
    timezone: input.timezone,
    intervalMinutes: input.intervalMinutes,
    dailyLimit: input.dailyLimit,
    resendRecipients: input.resendRecipients,
    missingValueAction: input.missingValueAction,
    unknownTokenAction: input.unknownTokenAction,
    previewFingerprint: input.previewFingerprint,
  };
  const requestHash = await computeRequestHash(requestHashInput);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const lockStart = Date.now();
        // 2. Acquire per-user advisory lock.
        await acquireUserCreationLock(tx, input.userId);
        const lockMs = Date.now() - lockStart;

        // 3. Look up existing submission.
        const existing = await tx.campaignSubmission.findUnique({
          where: {
            user_id_idempotency_key: {
              user_id: input.userId,
              idempotency_key: input.idempotencyKey,
            },
          },
          include: {
            campaign: {
              select: {
                id: true, name: true, _count: { select: { email_jobs: true } },
              },
            },
          },
        });

        if (existing) {
          if (existing.request_hash !== requestHash) {
            throw new IdempotencyKeyReusedError(
              'This idempotency key was already used with a different request.',
              { storedRequestHash: existing.request_hash, computedRequestHash: requestHash }
            );
          }
          const summary = existing.recipient_summary as unknown as EligibilitySummary;
          logger.info('campaign:replay', {
            requestId,
            campaignId: existing.campaign_id,
            policyVersion: summary.policyVersion,
            selectedCount: summary.selectedCount,
            eligibleCount: summary.eligibleCount,
            excludedCount: summary.excludedCount,
            jobCount: existing.campaign._count.email_jobs,
            lockMs,
            totalMs: Date.now() - startTime,
          });
          return {
            campaignId: existing.campaign_id,
            campaignName: existing.campaign.name,
            status: 'replayed' as const,
            recipientSummary: summary,
            jobCount: existing.campaign._count.email_jobs,
          };
        }

        // 4. Compute eligibility inside the transaction.
        const eligibility = await computeEligibility(tx, input);
        const { summary, preparedJobs } = eligibility;

        // 5. Recompute fingerprint and reject stale preview (§6.2 step 5).
        const recomputedFingerprint = await computePreviewFingerprint({
          templateId: input.templateId,
          emailAccountId: input.emailAccountId,
          attachmentIds: input.attachmentIds,
          contactIds: input.contactIds,
          resendRecipients: input.resendRecipients,
          missingValueAction: input.missingValueAction,
          unknownTokenAction: input.unknownTokenAction,
          eligibleRecipients: preparedJobs.map((job) => ({
            contactId: job.contactId,
            recipientEmail: job.toEmail,
            subject: job.subject,
            bodyText: job.body,
            bodyHtml: job.bodyHtml,
          })),
          includedPreviousCount: summary.includedPreviousCount,
          includedWithoutPreviousSendCount: summary.includedWithoutPreviousSendCount,
          followUpSentJobIds: eligibility.followUpSentJobIds,
        });

        if (recomputedFingerprint !== input.previewFingerprint) {
          throw new RecipientPreviewChangedError(
            'The recipient preview has changed. Please review the updated summary and try again.',
            { preCheck: summary }
          );
        }

        // 6. Check for blocking conditions.
        if (summary.blockedByUnknownTokens) {
          throw new RecipientActionRequiredError(
            'Unknown template tokens must be resolved before scheduling.',
            { unknownTokens: summary.unknownTokens, preCheck: summary }
          );
        }

        if (preparedJobs.length === 0) {
          throw new NoEligibleRecipientsError(
            'No eligible recipients remain after applying exclusions.',
            { eligibility: summary }
          );
        }

        // 6. Create campaign.
        const campaign = await tx.campaign.create({
          data: {
            user_id: input.userId,
            name: input.name,
            email_account_id: input.emailAccountId,
            attachment_ids: input.attachmentIds,
            template_id: input.templateId,
            start_at: input.startAt,
            timezone: input.timezone,
            interval_minutes: input.intervalMinutes,
            daily_limit: input.dailyLimit ?? undefined,
            status: 'ACTIVE',
          },
          select: {
            id: true, name: true,
            _count: { select: { email_jobs: true } },
          },
        });

        // Set creation keys on prepared jobs now that we have the campaign ID.
        const jobsWithKeys = preparedJobs.map((job) => ({
          ...job,
          creationKey: `${campaign.id}:${job.normalizedEmail}`,
        }));

        // Create all jobs in the same transaction.
        await createCampaignJobsFromSnapshot(
          tx,
          {
            id: campaign.id,
            user_id: input.userId,
            email_account_id: input.emailAccountId,
            attachment_ids: input.attachmentIds,
            template_id: input.templateId,
          },
          jobsWithKeys
        );

        // Create the durable submission receipt.
        const storedSummary = extractStoredSummary(summary);
        const normalizedResendRecipients = input.resendRecipients.map((r) => ({
          contactId: r.contactId,
          recipientEmail: normalizeEmail(r.recipientEmail),
        }));

        await tx.campaignSubmission.create({
          data: {
            user_id: input.userId,
            idempotency_key: input.idempotencyKey,
            request_hash: requestHash,
            campaign_id: campaign.id,
            recipient_summary: storedSummary as unknown as object,
            resend_recipients: normalizedResendRecipients as unknown as object,
          },
        });

        logger.info('campaign:created', {
          requestId,
          campaignId: campaign.id,
          policyVersion: summary.policyVersion,
          selectedCount: summary.selectedCount,
          eligibleCount: summary.eligibleCount,
          excludedCount: summary.excludedCount,
          includedPreviousCount: summary.includedPreviousCount,
          includedWithoutPreviousSendCount: summary.includedWithoutPreviousSendCount,
          jobCount: jobsWithKeys.length,
          lockMs,
          totalMs: Date.now() - startTime,
        });

        return {
          campaignId: campaign.id,
          campaignName: campaign.name,
          status: 'created' as const,
          recipientSummary: summary,
          jobCount: jobsWithKeys.length,
        };
      },
      {
        timeout: 10_000,
        isolationLevel: 'ReadCommitted',
      }
    );
    return result;
  } catch (err) {
    // Map lock timeout / contention to 503.
    if (err instanceof AppError) {
      if (err.code === 'IDEMPOTENCY_KEY_REUSED') {
        logger.warn('campaign:conflict:key-reused', {
          requestId,
          code: err.code,
          totalMs: Date.now() - startTime,
        });
      } else if (err.code === 'CAMPAIGN_CREATION_BUSY') {
        logger.warn('campaign:conflict:busy', {
          requestId,
          code: err.code,
          totalMs: Date.now() - startTime,
        });
      } else {
        logger.warn('campaign:creation-failed', {
          requestId,
          code: err.code,
          totalMs: Date.now() - startTime,
        });
      }
      throw err;
    }
    const code = (err as { code?: string })?.code;
    if (code === 'P2034' || code === 'P2002') {
      // P2034 = transaction timeout, P2002 = unique constraint (creation_key conflict)
      if (code === 'P2002') {
        // Could be a creation-key conflict or submission conflict.
        // The submission lookup above handles same-key replay. A creation-key
        // conflict means a concurrent request created the same campaign/address.
        logger.warn('campaign:conflict:unique-constraint', {
          requestId,
          prismaCode: code,
          totalMs: Date.now() - startTime,
        });
        throw new CampaignCreationBusyError(
          'Campaign creation is busy. Please try again shortly.',
          { retryAfterSeconds: 2 }
        );
      }
      logger.warn('campaign:conflict:timeout', {
        requestId,
        prismaCode: code,
        totalMs: Date.now() - startTime,
      });
      throw new CampaignCreationBusyError(
        'Campaign creation timed out. Please try again.',
        { retryAfterSeconds: 2 }
      );
    }
    logger.error('campaign:creation-failed:unexpected', {
      requestId,
      errorName: (err as Error)?.name,
      totalMs: Date.now() - startTime,
    });
    throw err;
  }
}
