import { describe, it, expect } from 'vitest';
import {
  sha256Hex,
  canonicalJson,
  sortResendPairs,
  computePreviewFingerprint,
  computeRequestHash,
} from '@/lib/campaigns/fingerprint';

describe('lib/campaigns/fingerprint', () => {
  describe('sha256Hex', () => {
    it('returns a 64-character lowercase hex string', async () => {
      const hash = await sha256Hex('test');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic', async () => {
      const a = await sha256Hex('test');
      const b = await sha256Hex('test');
      expect(a).toBe(b);
    });

    it('differs for different inputs', async () => {
      const a = await sha256Hex('test1');
      const b = await sha256Hex('test2');
      expect(a).not.toBe(b);
    });

    it('matches known SHA-256 of empty string', async () => {
      const hash = await sha256Hex('');
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('canonicalJson', () => {
    it('sorts object keys', () => {
      expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    });

    it('sorts nested object keys', () => {
      expect(canonicalJson({ outer: { z: 1, a: 2 } })).toBe('{"outer":{"a":2,"z":1}}');
    });

    it('preserves array order', () => {
      expect(canonicalJson({ arr: [3, 1, 2] })).toBe('{"arr":[3,1,2]}');
    });

    it('omits undefined values', () => {
      expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    });

    it('retains null values', () => {
      expect(canonicalJson({ a: null })).toBe('{"a":null}');
    });

    it('produces the same output regardless of key insertion order', () => {
      const a = canonicalJson({ x: 1, y: 2, z: 3 });
      const b = canonicalJson({ z: 3, x: 1, y: 2 });
      expect(a).toBe(b);
    });
  });

  describe('sortResendPairs', () => {
    it('sorts by contactId then recipientEmail', () => {
      const pairs = [
        { contactId: 'B', recipientEmail: 'b@test.com' },
        { contactId: 'A', recipientEmail: 'z@test.com' },
        { contactId: 'A', recipientEmail: 'a@test.com' },
      ];
      const sorted = sortResendPairs(pairs);
      expect(sorted[0].contactId).toBe('a');
      expect(sorted[0].recipientEmail).toBe('a@test.com');
      expect(sorted[1].contactId).toBe('a');
      expect(sorted[1].recipientEmail).toBe('z@test.com');
      expect(sorted[2].contactId).toBe('b');
    });

    it('normalizes contactId to lowercase', () => {
      const sorted = sortResendPairs([{ contactId: 'ABC', recipientEmail: 'A@B.COM' }]);
      expect(sorted[0].contactId).toBe('abc');
      expect(sorted[0].recipientEmail).toBe('a@b.com');
    });
  });

  describe('computePreviewFingerprint', () => {
    const baseInput = {
      templateId: 't1',
      emailAccountId: 'e1',
      attachmentIds: ['a1'],
      contactIds: ['c1', 'c2'],
      resendRecipients: [],
      missingValueAction: 'exclude' as const,
      unknownTokenAction: 'fix' as const,
      eligibleRecipients: [
        { contactId: 'c1', recipientEmail: 'c1@test.com', subject: 'Hi', bodyText: 'Body', bodyHtml: null },
      ],
      includedPreviousCount: 0,
      includedWithoutPreviousSendCount: 1,
      followUpSentJobIds: [],
    };

    it('returns a 64-char hex string', async () => {
      const fp = await computePreviewFingerprint(baseInput);
      expect(fp).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic for the same input', async () => {
      const a = await computePreviewFingerprint(baseInput);
      const b = await computePreviewFingerprint(baseInput);
      expect(a).toBe(b);
    });

    it('changes when contactIds change', async () => {
      const a = await computePreviewFingerprint(baseInput);
      const b = await computePreviewFingerprint({ ...baseInput, contactIds: ['c2', 'c1'] });
      expect(a).not.toBe(b);
    });

    it('changes when eligible recipients change', async () => {
      const a = await computePreviewFingerprint(baseInput);
      const b = await computePreviewFingerprint({
        ...baseInput,
        eligibleRecipients: [
          { contactId: 'c1', recipientEmail: 'c1@test.com', subject: 'Different', bodyText: 'Body', bodyHtml: null },
        ],
      });
      expect(a).not.toBe(b);
    });

    it('changes when resend recipients change', async () => {
      const a = await computePreviewFingerprint(baseInput);
      const b = await computePreviewFingerprint({
        ...baseInput,
        resendRecipients: [{ contactId: 'c1', recipientEmail: 'c1@test.com' }],
      });
      expect(a).not.toBe(b);
    });
  });

  describe('computeRequestHash', () => {
    const baseInput = {
      name: 'Campaign',
      templateId: 't1',
      emailAccountId: 'e1',
      attachmentIds: ['a1'],
      contactIds: ['c1'],
      startAt: '2024-01-15T09:00:00.000Z',
      timezone: 'UTC',
      intervalMinutes: 5,
      dailyLimit: null,
      resendRecipients: [],
      missingValueAction: 'exclude' as const,
      unknownTokenAction: 'fix' as const,
      previewFingerprint: 'a'.repeat(64),
    };

    it('returns a 64-char hex string', async () => {
      const hash = await computeRequestHash(baseInput);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic', async () => {
      const a = await computeRequestHash(baseInput);
      const b = await computeRequestHash(baseInput);
      expect(a).toBe(b);
    });

    it('changes when name changes', async () => {
      const a = await computeRequestHash(baseInput);
      const b = await computeRequestHash({ ...baseInput, name: 'Different' });
      expect(a).not.toBe(b);
    });

    it('changes when contactIds change', async () => {
      const a = await computeRequestHash(baseInput);
      const b = await computeRequestHash({ ...baseInput, contactIds: ['c2'] });
      expect(a).not.toBe(b);
    });
  });
});
