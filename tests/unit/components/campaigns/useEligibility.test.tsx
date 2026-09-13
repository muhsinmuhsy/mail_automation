import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEligibility, type EligibilityResult } from '@/components/campaigns/useEligibility';

const VALID_FINGERPRINT = 'a'.repeat(64);

function makeResult(overrides: Partial<EligibilityResult> = {}): EligibilityResult {
  return {
    missingValues: [],
    unknownTokens: [],
    affectedContactCount: 0,
    totalContactCount: 1,
    policyVersion: 1,
    checkedAt: new Date().toISOString(),
    previewFingerprint: VALID_FINGERPRINT,
    selectedCount: 1,
    eligibleCount: 1,
    excludedCount: 0,
    excludedByReason: { duplicateAddress: 0, previouslySent: 0, pending: 0, deliveryUnknown: 0, missingValues: 0 },
    includedPreviousCount: 0,
    includedWithoutPreviousSendCount: 1,
    blockedByUnknownTokens: false,
    recipients: [{ contactId: 'c1', included: true, followUpSelected: false, canSelectFollowUp: false, primaryReason: null }],
    ...overrides,
  };
}

function mockFetchSuccess(result: EligibilityResult = makeResult()) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: result }),
  }));
  return vi.mocked(fetch);
}

function mockFetchError(message = 'Server error') {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ success: false, error: { message } }),
  }));
  return vi.mocked(fetch);
}

const baseParams = {
  templateId: 'template-1',
  emailAccountId: 'account-1',
  contactIds: ['c1'],
  attachmentIds: [] as string[],
  resendRecipients: [] as { contactId: string; recipientEmail: string }[],
  missingValueAction: 'exclude' as 'exclude' | 'continue',
  unknownTokenAction: 'fix' as 'fix' | 'continue',
  enabled: true,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useEligibility — initial state', () => {
  it('starts in idle status with null result when disabled', () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useEligibility({ ...baseParams, enabled: false }));
    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.isReady).toBe(false);
    expect(result.current.isChecking).toBe(false);
    expect(result.current.canSchedule).toBe(false);
  });

  it('effectiveCount falls back to contactIds.length when not ready', () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useEligibility({ ...baseParams, contactIds: ['c1', 'c2', 'c3'] }));
    expect(result.current.effectiveCount).toBe(3);
  });
});

describe('useEligibility — fires immediately (no debounce)', () => {
  it('fires check immediately when enabled is already true on first render', async () => {
    const mockFetch = mockFetchSuccess();
    const { result } = renderHook(() => useEligibility(baseParams));

    await act(async () => { vi.advanceTimersByTime(0); });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('ready');
    expect(result.current.isReady).toBe(true);
  });

  it('fires check immediately when enabled transitions from false to true', async () => {
    const mockFetch = mockFetchSuccess();
    const { result, rerender } = renderHook(({ enabled }) => useEligibility({ ...baseParams, enabled }), {
      initialProps: { enabled: false },
    });

    expect(mockFetch).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('ready');
    expect(result.current.isReady).toBe(true);
  });

  it('fires immediately when templateId changes (no debounce)', async () => {
    const mockFetch = mockFetchSuccess();
    const { rerender } = renderHook(({ templateId }) => useEligibility({ ...baseParams, templateId }), {
      initialProps: { templateId: 'template-1' },
    });

    await act(async () => { vi.advanceTimersByTime(0); });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender({ templateId: 'template-2' });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('fires immediately when emailAccountId changes (no debounce)', async () => {
    const mockFetch = mockFetchSuccess();
    const { rerender } = renderHook(({ emailAccountId }) => useEligibility({ ...baseParams, emailAccountId }), {
      initialProps: { emailAccountId: 'account-1' },
    });

    await act(async () => { vi.advanceTimersByTime(0); });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender({ emailAccountId: 'account-2' });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('fires immediately when attachmentIds change (no debounce)', async () => {
    const mockFetch = mockFetchSuccess();
    const { rerender } = renderHook(({ attachmentIds }) => useEligibility({ ...baseParams, attachmentIds }), {
      initialProps: { attachmentIds: [] as string[] },
    });

    await act(async () => { vi.advanceTimersByTime(0); });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender({ attachmentIds: ['a1'] });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('fires immediately when contactIds change (no debounce)', async () => {
    const mockFetch = mockFetchSuccess();
    const { rerender } = renderHook(({ contactIds }) => useEligibility({ ...baseParams, contactIds }), {
      initialProps: { contactIds: ['c1'] },
    });

    await act(async () => { vi.advanceTimersByTime(0); });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender({ contactIds: ['c1', 'c2'] });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('fires immediately when resendRecipients change (no debounce)', async () => {
    const mockFetch = mockFetchSuccess();
    const { rerender } = renderHook(({ resendRecipients }) => useEligibility({ ...baseParams, resendRecipients }), {
      initialProps: { resendRecipients: [] as { contactId: string; recipientEmail: string }[] },
    });

    await act(async () => { vi.advanceTimersByTime(0); });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender({ resendRecipients: [{ contactId: 'c1', recipientEmail: 'ada@example.com' }] });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('fires immediately when missingValueAction changes (no debounce)', async () => {
    const mockFetch = mockFetchSuccess();
    const { rerender } = renderHook(({ missingValueAction }) => useEligibility({ ...baseParams, missingValueAction }), {
      initialProps: { missingValueAction: 'exclude' as 'exclude' | 'continue' },
    });

    await act(async () => { vi.advanceTimersByTime(0); });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender({ missingValueAction: 'continue' });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('useEligibility — abort behavior', () => {
  it('aborts previous request when a new trigger fires', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    mockFetchSuccess();

    const { rerender } = renderHook(({ templateId }) => useEligibility({ ...baseParams, templateId }), {
      initialProps: { templateId: 'template-1' },
    });

    await act(async () => { vi.advanceTimersByTime(0); });

    rerender({ templateId: 'template-2' });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
  });
});

describe('useEligibility — error handling', () => {
  it('sets error status when fetch returns non-ok response', async () => {
    mockFetchError('Template not found');
    const { result } = renderHook(() => useEligibility(baseParams));

    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('Template not found');
    expect(result.current.isReady).toBe(false);
    expect(result.current.canSchedule).toBe(false);
  });

  it('sets error status when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { result } = renderHook(() => useEligibility(baseParams));

    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('Could not check recipients. Try again.');
  });

  it('retry triggers a new check', async () => {
    const mockFetch = mockFetchSuccess();
    const { result } = renderHook(() => useEligibility(baseParams));

    await act(async () => { vi.advanceTimersByTime(0); });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    act(() => { result.current.retry(); });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('useEligibility — derived state', () => {
  it('isReady is true when status is ready and result is not null', async () => {
    mockFetchSuccess();
    const { result } = renderHook(() => useEligibility(baseParams));

    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.isReady).toBe(true);
  });

  it('isChecking is true when status is checking', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));
    const { result } = renderHook(() => useEligibility(baseParams));

    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.isChecking).toBe(true);
  });

  it('canSchedule is false when eligibleCount is 0', async () => {
    mockFetchSuccess(makeResult({ eligibleCount: 0, excludedCount: 1 }));
    const { result } = renderHook(() => useEligibility(baseParams));

    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.isReady).toBe(true);
    expect(result.current.canSchedule).toBe(false);
  });

  it('canSchedule is false when blockedByUnknownTokens is true', async () => {
    mockFetchSuccess(makeResult({ blockedByUnknownTokens: true, unknownTokens: ['{{unknown}}'] }));
    const { result } = renderHook(() => useEligibility(baseParams));

    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.isReady).toBe(true);
    expect(result.current.isBlocked).toBe(true);
    expect(result.current.canSchedule).toBe(false);
  });

  it('canSchedule is true when eligible, not blocked, no unknown tokens', async () => {
    mockFetchSuccess(makeResult({ eligibleCount: 5 }));
    const { result } = renderHook(() => useEligibility(baseParams));

    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.canSchedule).toBe(true);
  });

  it('effectiveCount uses result.eligibleCount when ready', async () => {
    mockFetchSuccess(makeResult({ eligibleCount: 7 }));
    const { result } = renderHook(() => useEligibility({ ...baseParams, contactIds: ['c1', 'c2'] }));

    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.effectiveCount).toBe(7);
  });
});

describe('useEligibility — no trigger when disabled or missing required fields', () => {
  it('does not fire when enabled is false', async () => {
    const mockFetch = mockFetchSuccess();
    renderHook(() => useEligibility({ ...baseParams, enabled: false }));

    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not fire when contactIds is empty', async () => {
    const mockFetch = mockFetchSuccess();
    renderHook(() => useEligibility({ ...baseParams, contactIds: [] }));

    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not fire when templateId is empty', async () => {
    const mockFetch = mockFetchSuccess();
    renderHook(() => useEligibility({ ...baseParams, templateId: '' }));

    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not fire when emailAccountId is empty', async () => {
    const mockFetch = mockFetchSuccess();
    renderHook(() => useEligibility({ ...baseParams, emailAccountId: '' }));

    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('useEligibility — cleanup', () => {
  it('aborts pending request on unmount', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));

    const { unmount } = renderHook(() => useEligibility(baseParams));

    await act(async () => { vi.advanceTimersByTime(0); });
    unmount();

    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
  });
});

describe('useEligibility — stale-while-revalidate', () => {
  it('keeps previous result visible (isReady stays true) during refetch', async () => {
    const firstResult = makeResult({ eligibleCount: 2 });
    const secondResult = makeResult({ eligibleCount: 3 });

    let resolveSecond: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      if (mockedFetchCalls === 0) {
        mockedFetchCalls++;
        return { ok: true, json: async () => ({ success: true, data: firstResult }) };
      }
      mockedFetchCalls++;
      return new Promise((resolve) => { resolveSecond = resolve; });
    }));
    let mockedFetchCalls = 0;

    const { result, rerender } = renderHook(({ contactIds }) => useEligibility({ ...baseParams, contactIds }), {
      initialProps: { contactIds: ['c1'] },
    });

    await act(async () => { vi.advanceTimersByTime(0); });
    expect(result.current.status).toBe('ready');
    expect(result.current.isReady).toBe(true);
    expect(result.current.result?.eligibleCount).toBe(2);

    rerender({ contactIds: ['c1', 'c2'] });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.isReady).toBe(true);
    expect(result.current.isStale).toBe(true);
    expect(result.current.isFetching).toBe(true);
    expect(result.current.isChecking).toBe(false);
    expect(result.current.result?.eligibleCount).toBe(2);

    await act(async () => {
      resolveSecond({ ok: true, json: async () => ({ success: true, data: secondResult }) });
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.isReady).toBe(true);
    expect(result.current.isStale).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.result?.eligibleCount).toBe(3);
  });

  it('canSchedule is false during refetch (cannot submit with stale data)', async () => {
    const firstResult = makeResult({ eligibleCount: 2 });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      if (mockedCalls === 0) {
        mockedCalls++;
        return { ok: true, json: async () => ({ success: true, data: firstResult }) };
      }
      mockedCalls++;
      return new Promise(() => {});
    }));
    let mockedCalls = 0;

    const { result, rerender } = renderHook(({ contactIds }) => useEligibility({ ...baseParams, contactIds }), {
      initialProps: { contactIds: ['c1'] },
    });

    await act(async () => { vi.advanceTimersByTime(0); });
    expect(result.current.canSchedule).toBe(true);

    rerender({ contactIds: ['c1', 'c2'] });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.canSchedule).toBe(false);
    expect(result.current.isReady).toBe(true);
  });

  it('isChecking is true only on initial load, not during refetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      if (mockedCalls === 0) {
        mockedCalls++;
        return { ok: true, json: async () => ({ success: true, data: makeResult() }) };
      }
      mockedCalls++;
      return new Promise(() => {});
    }));
    let mockedCalls = 0;

    const { result, rerender } = renderHook(({ contactIds }) => useEligibility({ ...baseParams, contactIds }), {
      initialProps: { contactIds: ['c1'] },
    });

    await act(async () => { vi.advanceTimersByTime(0); });
    expect(result.current.isChecking).toBe(false);

    rerender({ contactIds: ['c1', 'c2'] });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.isChecking).toBe(false);
    expect(result.current.isStale).toBe(true);
    expect(result.current.isFetching).toBe(true);
  });

  it('isChecking is true on initial load with no previous data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => {})));

    const { result } = renderHook(() => useEligibility(baseParams));

    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.isChecking).toBe(true);
    expect(result.current.isStale).toBe(false);
    expect(result.current.isFetching).toBe(true);
    expect(result.current.isReady).toBe(false);
    expect(result.current.result).toBeNull();
  });

  it('effectiveCount uses previous result during refetch (stable count)', async () => {
    const firstResult = makeResult({ eligibleCount: 5 });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      if (mockedCalls === 0) {
        mockedCalls++;
        return { ok: true, json: async () => ({ success: true, data: firstResult }) };
      }
      mockedCalls++;
      return new Promise(() => {});
    }));
    let mockedCalls = 0;

    const { result, rerender } = renderHook(({ contactIds }) => useEligibility({ ...baseParams, contactIds }), {
      initialProps: { contactIds: ['c1'] },
    });

    await act(async () => { vi.advanceTimersByTime(0); });
    expect(result.current.effectiveCount).toBe(5);

    rerender({ contactIds: ['c1', 'c2', 'c3'] });
    await act(async () => { vi.advanceTimersByTime(0); });

    expect(result.current.effectiveCount).toBe(5);
  });
});
