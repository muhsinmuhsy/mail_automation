import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectionString, beginTest, rollbackTest } from './helpers/dedup-test-setup';
import { computePreviewFingerprint, computeRequestHash } from '@/lib/campaigns/fingerprint';

const baseFingerprintInput = {
  templateId: '00000000-0000-0000-0000-000000000001',
  emailAccountId: '00000000-0000-0000-0000-000000000002',
  attachmentIds: ['00000000-0000-0000-0000-000000000003'],
  contactIds: ['00000000-0000-0000-0000-000000000004'],
  resendRecipients: [],
  missingValueAction: 'exclude' as const,
  unknownTokenAction: 'fix' as const,
  eligibleRecipients: [
    {
      contactId: '00000000-0000-0000-0000-000000000004',
      recipientEmail: 'alice@example.com',
      subject: 'Hello Alice',
      bodyText: 'Body for Alice',
      bodyHtml: null,
    },
  ],
  includedPreviousCount: 0,
  includedWithoutPreviousSendCount: 1,
  followUpSentJobIds: [],
};

const baseRequestHashInput = {
  name: 'Campaign A',
  templateId: '00000000-0000-0000-0000-000000000001',
  emailAccountId: '00000000-0000-0000-0000-000000000002',
  attachmentIds: ['00000000-0000-0000-0000-000000000003'],
  contactIds: ['00000000-0000-0000-0000-000000000004'],
  startAt: '2026-01-01T00:00:00.000Z',
  timezone: 'UTC',
  intervalMinutes: 5,
  dailyLimit: null as number | null,
  resendRecipients: [],
  missingValueAction: 'exclude' as const,
  unknownTokenAction: 'fix' as const,
  previewFingerprint: 'a'.repeat(64),
};

describe('campaign deduplication — fingerprint stability (pure function)', () => {
  it('preview fingerprint is stable under incidental changes (last_sent_at, status)', async () => {
    const fp1 = await computePreviewFingerprint(baseFingerprintInput);
    const fp2 = await computePreviewFingerprint(baseFingerprintInput);
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(64);
  });

  it('preview fingerprint is stable when resend recipients are reordered', async () => {
    const contactA = '00000000-0000-0000-0000-000000000010';
    const contactB = '00000000-0000-0000-0000-000000000011';
    const input = {
      ...baseFingerprintInput,
      contactIds: [contactA, contactB],
      resendRecipients: [
        { contactId: contactA, recipientEmail: 'a@example.com' },
        { contactId: contactB, recipientEmail: 'b@example.com' },
      ],
      eligibleRecipients: [
        { contactId: contactA, recipientEmail: 'a@example.com', subject: 'S', bodyText: 'B', bodyHtml: null },
        { contactId: contactB, recipientEmail: 'b@example.com', subject: 'S', bodyText: 'B', bodyHtml: null },
      ],
      includedPreviousCount: 2,
      includedWithoutPreviousSendCount: 0,
      followUpSentJobIds: ['job1', 'job2'],
    };
    const reordered = {
      ...input,
      resendRecipients: [
        { contactId: contactB, recipientEmail: 'b@example.com' },
        { contactId: contactA, recipientEmail: 'a@example.com' },
      ],
      followUpSentJobIds: ['job2', 'job1'],
    };
    const fp1 = await computePreviewFingerprint(input);
    const fp2 = await computePreviewFingerprint(reordered);
    expect(fp1).toBe(fp2);
  });

  it('preview fingerprint changes on material change — different template', async () => {
    const fp1 = await computePreviewFingerprint(baseFingerprintInput);
    const fp2 = await computePreviewFingerprint({
      ...baseFingerprintInput,
      templateId: '00000000-0000-0000-0000-000000000099',
    });
    expect(fp1).not.toBe(fp2);
  });

  it('preview fingerprint changes on material change — different eligible recipient content', async () => {
    const fp1 = await computePreviewFingerprint(baseFingerprintInput);
    const fp2 = await computePreviewFingerprint({
      ...baseFingerprintInput,
      eligibleRecipients: [
        {
          contactId: '00000000-0000-0000-0000-000000000004',
          recipientEmail: 'alice@example.com',
          subject: 'DIFFERENT SUBJECT',
          bodyText: 'Body for Alice',
          bodyHtml: null,
        },
      ],
    });
    expect(fp1).not.toBe(fp2);
  });

  it('preview fingerprint changes on material change — different contacts', async () => {
    const fp1 = await computePreviewFingerprint(baseFingerprintInput);
    const fp2 = await computePreviewFingerprint({
      ...baseFingerprintInput,
      contactIds: ['00000000-0000-0000-0000-000000000099'],
    });
    expect(fp1).not.toBe(fp2);
  });

  it('preview fingerprint changes on material change — different email account', async () => {
    const fp1 = await computePreviewFingerprint(baseFingerprintInput);
    const fp2 = await computePreviewFingerprint({
      ...baseFingerprintInput,
      emailAccountId: '00000000-0000-0000-0000-000000000098',
    });
    expect(fp1).not.toBe(fp2);
  });

  it('request hash is stable for identical inputs', async () => {
    const h1 = await computeRequestHash(baseRequestHashInput);
    const h2 = await computeRequestHash(baseRequestHashInput);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('request hash changes on material change — different name', async () => {
    const h1 = await computeRequestHash(baseRequestHashInput);
    const h2 = await computeRequestHash({ ...baseRequestHashInput, name: 'Campaign B' });
    expect(h1).not.toBe(h2);
  });

  it('request hash changes on material change — different start time', async () => {
    const h1 = await computeRequestHash(baseRequestHashInput);
    const h2 = await computeRequestHash({ ...baseRequestHashInput, startAt: '2026-01-02T00:00:00.000Z' });
    expect(h1).not.toBe(h2);
  });

  it('request hash changes on material change — different preview fingerprint', async () => {
    const h1 = await computeRequestHash(baseRequestHashInput);
    const h2 = await computeRequestHash({ ...baseRequestHashInput, previewFingerprint: 'b'.repeat(64) });
    expect(h1).not.toBe(h2);
  });

  it('request hash is stable when resend recipients are reordered', async () => {
    const contactA = '00000000-0000-0000-0000-000000000010';
    const contactB = '00000000-0000-0000-0000-000000000011';
    const input = {
      ...baseRequestHashInput,
      resendRecipients: [
        { contactId: contactA, recipientEmail: 'a@example.com' },
        { contactId: contactB, recipientEmail: 'b@example.com' },
      ],
    };
    const reordered = {
      ...baseRequestHashInput,
      resendRecipients: [
        { contactId: contactB, recipientEmail: 'b@example.com' },
        { contactId: contactA, recipientEmail: 'a@example.com' },
      ],
    };
    const h1 = await computeRequestHash(input);
    const h2 = await computeRequestHash(reordered);
    expect(h1).toBe(h2);
  });
});

describe.skipIf(!connectionString)('campaign deduplication — fingerprint conflict (real PostgreSQL)', () => {
  it('different request hashes with same idempotency key → unique violation (409)', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const idempotencyKey = randomUUID();
      const campaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'fp1@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId, userId, 'C', new Date()]);

      const hash1 = await computeRequestHash({ ...baseRequestHashInput, name: 'Campaign A' });
      const hash2 = await computeRequestHash({ ...baseRequestHashInput, name: 'Campaign B' });
      expect(hash1).not.toBe(hash2);

      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userId, idempotencyKey, hash1, campaignId, JSON.stringify({ eligibleCount: 1 })]
      );

      const campaignId2 = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId2, userId, 'C2', new Date()]);

      await expect(
        client.query(
          'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
          [userId, idempotencyKey, hash2, campaignId2, JSON.stringify({ eligibleCount: 1 })]
        )
      ).rejects.toThrow(/unique|duplicate/i);
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('same request hash with same idempotency key → replay (no conflict)', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const idempotencyKey = randomUUID();
      const campaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'fp2@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId, userId, 'C', new Date()]);

      const hash = await computeRequestHash(baseRequestHashInput);

      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userId, idempotencyKey, hash, campaignId, JSON.stringify({ eligibleCount: 1 })]
      );

      const stored = await client.query(
        'SELECT request_hash FROM campaign_submissions WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey]
      );
      expect((stored.rows[0] as { request_hash: string }).request_hash).toBe(hash);
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);
});
