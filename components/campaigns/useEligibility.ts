'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

const DEBOUNCE_MS = 250;
const FRESHNESS_MS = 60_000;
const POLL_MS = 30_000;

export function useEligibility(params: UseEligibilityParams) {
  const { templateId, emailAccountId, contactIds, attachmentIds, resendRecipients, missingValueAction, unknownTokenAction, enabled } = params;
  const [status, setStatus] = useState<EligibilityStatus>('idle');
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastSuccessAt = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const contactIdsKey = contactIds.join(',');
  const attachmentIdsKey = attachmentIds.join(',');
  const resendKey = resendRecipients.map(r => `${r.contactId}:${r.recipientEmail}`).join('|');
  const hasRequired = Boolean(templateId && emailAccountId && contactIds.length > 0);

  const check = useCallback(async (signal: AbortSignal, reqId: number) => {
    if (!templateId || !emailAccountId || contactIds.length === 0) {
      if (reqId === requestIdRef.current) {
        setStatus('idle');
        setResult(null);
      }
      return;
    }
    if (reqId !== requestIdRef.current) return;
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
        signal,
      });
      if (reqId !== requestIdRef.current) return;
      const body = await response.json() as { success: boolean; data?: EligibilityResult; error?: { message?: string } };
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
      if (signal.aborted || reqId !== requestIdRef.current) return;
      setStatus('error');
      setErrorMessage('Could not check recipients. Try again.');
    }
  }, [templateId, emailAccountId, contactIds, attachmentIds, resendRecipients, missingValueAction, unknownTokenAction]);

  const triggerCheck = useCallback((immediate: boolean) => {
    if (!enabled) return;
    requestIdRef.current += 1;
    const reqId = requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (immediate) {
      void check(controller.signal, reqId);
    } else {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      setStatus(prev => prev === 'ready' ? 'stale' : prev);
      debounceTimer.current = setTimeout(() => {
        void check(controller.signal, reqId);
      }, DEBOUNCE_MS);
    }
  }, [check, enabled]);

  useEffect(() => {
    if (!hasRequired) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      abortRef.current?.abort();
      requestIdRef.current += 1;
      return;
    }
    triggerCheck(false);
  }, [hasRequired, templateId, emailAccountId, contactIdsKey, attachmentIdsKey, resendKey, missingValueAction, unknownTokenAction, triggerCheck]);

  useEffect(() => {
    if (!hasRequired && status !== 'idle') {
      const timer = setTimeout(() => { setStatus('idle'); setResult(null); }, 0);
      return () => clearTimeout(timer);
    }
  }, [hasRequired, status]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!enabled || status !== 'ready') return;
    pollTimer.current = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSuccessAt.current > FRESHNESS_MS) {
        triggerCheck(false);
      }
    }, POLL_MS);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [enabled, status, triggerCheck]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && enabled && hasRequired) {
        if (Date.now() - lastSuccessAt.current > FRESHNESS_MS) {
          triggerCheck(true);
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, hasRequired, triggerCheck]);

  const retry = useCallback(() => {
    triggerCheck(true);
  }, [triggerCheck]);

  const effectiveCount = result?.eligibleCount ?? contactIds.length;
  const isReady = status === 'ready' && result !== null;
  const isChecking = status === 'checking' || status === 'stale';
  const isBlocked = isReady && result.blockedByUnknownTokens;
  const canSchedule = isReady && !isBlocked && result.eligibleCount > 0 && !result.unknownTokens.length;

  return { status, result, errorMessage, effectiveCount, isReady, isChecking, isBlocked, canSchedule, retry };
}
