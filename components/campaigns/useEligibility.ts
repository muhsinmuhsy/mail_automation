'use client';

import { useEffect, useRef, useState } from 'react';

export type EligibilityStatus = 'idle' | 'checking' | 'ready' | 'stale' | 'error';

export interface EligibilityRecipient {
  contactId: string;
  included: boolean;
  followUpSelected: boolean;
  canSelectFollowUp: boolean;
  primaryReason: string | null;
  representativeContactId?: string;
  lastSentAt?: string;
  pendingScheduledAt?: string;
  name?: string | null;
  recipientEmail?: string;
  hasPreviousSend?: boolean;
}

export interface EligibilityResult {
  missingValues: { token: string; label: string; contactCount: number; contactIds: string[] }[];
  unknownTokens: string[];
  affectedContactCount: number;
  totalContactCount: number;
  policyVersion: number;
  checkedAt: string;
  previewFingerprint: string;
  selectedCount: number;
  eligibleCount: number;
  excludedCount: number;
  excludedByReason: {
    duplicateAddress: number;
    previouslySent: number;
    pending: number;
    deliveryUnknown: number;
    missingValues: number;
  };
  includedPreviousCount: number;
  includedWithoutPreviousSendCount: number;
  blockedByUnknownTokens: boolean;
  recipients: EligibilityRecipient[];
}

interface UseEligibilityParams {
  templateId: string;
  emailAccountId: string;
  contactIds: string[];
  attachmentIds: string[];
  resendRecipients: { contactId: string; recipientEmail: string }[];
  missingValueAction: 'exclude' | 'continue';
  unknownTokenAction: 'fix' | 'continue';
  enabled: boolean;
}

const FRESHNESS_MS = 60_000;
const POLL_MS = 30_000;

export function useEligibility(params: UseEligibilityParams) {
  const { templateId, emailAccountId, contactIds, attachmentIds, resendRecipients, missingValueAction, unknownTokenAction, enabled } = params;
  const [status, setStatus] = useState<EligibilityStatus>('idle');
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastSuccessAt = useRef(0);

  const requestKey = `${enabled}|${templateId}|${emailAccountId}|${contactIds.join(',')}|${attachmentIds.join(',')}|${resendRecipients.map(r => `${r.contactId}:${r.recipientEmail}`).join('|')}|${missingValueAction}|${unknownTokenAction}|${retryCount}`;
  const hasRequired = Boolean(enabled && templateId && emailAccountId && contactIds.length > 0);

  useEffect(() => {
    if (!hasRequired) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      requestIdRef.current += 1;
      if (status !== 'idle') {
        const t = setTimeout(() => { setStatus('idle'); setResult(null); }, 0);
        return () => clearTimeout(t);
      }
      return;
    }

    requestIdRef.current += 1;
    const reqId = requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      setStatus(prev => prev === 'ready' ? 'stale' : 'checking');
      try {
        const response = await fetch('/api/campaigns/pre-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            templateId,
            emailAccountId,
            contactIds,
            attachmentIds,
            resendRecipients,
            missingValueAction,
            unknownTokenAction,
          }),
          signal: controller.signal,
        });
        if (reqId !== requestIdRef.current) return;
        const body = await response.json() as { success: boolean; data?: EligibilityResult; error?: { message?: string } };
        if (reqId !== requestIdRef.current) return;
        if (!response.ok || !body.success) {
          setStatus('error');
          setErrorMessage(body?.error?.message ?? 'Could not check recipients. Try again.');
          return;
        }
        setStatus('ready');
        setResult(body.data as EligibilityResult);
        setErrorMessage(null);
        lastSuccessAt.current = Date.now();
      } catch {
        if (controller.signal.aborted || reqId !== requestIdRef.current) return;
        setStatus('error');
        setErrorMessage('Could not check recipients. Try again.');
      }
    })();
  }, [requestKey, hasRequired]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!hasRequired || status !== 'ready') return;
    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSuccessAt.current > FRESHNESS_MS) {
        setRetryCount(c => c + 1);
      }
    }, POLL_MS);
    return () => clearInterval(poll);
  }, [hasRequired, status]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && hasRequired) {
        if (Date.now() - lastSuccessAt.current > FRESHNESS_MS) {
          setRetryCount(c => c + 1);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [hasRequired]);

  const retry = () => setRetryCount(c => c + 1);

  const effectiveCount = result?.eligibleCount ?? contactIds.length;
  const isReady = status === 'ready' && result !== null;
  const isChecking = status === 'checking' || status === 'stale';
  const isBlocked = isReady && result.blockedByUnknownTokens;
  const canSchedule = isReady && !isBlocked && result.eligibleCount > 0 && !result.unknownTokens.length;

  return { status, result, errorMessage, effectiveCount, isReady, isChecking, isBlocked, canSchedule, retry };
}
