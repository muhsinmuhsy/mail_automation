import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectionString, beginTest, rollbackTest } from './helpers/dedup-test-setup';

describe.skipIf(!connectionString)('campaign deduplication — idempotency (real PostgreSQL)', () => {
  it('same idempotency key + same request hash → replay (no duplicate campaign)', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();
      const campaignId = randomUUID();
      const idempotencyKey = randomUUID();
      const requestHash = 'a'.repeat(64);

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'idem1@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'idem1@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [campaignId, userId, 'C', new Date(), accountId, templateId, 'ACTIVE']);

      const contactId = randomUUID();
      await client.query('INSERT INTO contacts (id, user_id, name, email) VALUES ($1, $2, $3, $4)', [contactId, userId, 'C', 'c@example.com']);
      const creationKey = `${campaignId}:c@example.com`;
      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at, creation_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now(), $8)`,
        [userId, campaignId, contactId, templateId, accountId, 'c@example.com', 'Subject', creationKey]
      );

      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userId, idempotencyKey, requestHash, campaignId, JSON.stringify({ eligibleCount: 1 })]
      );

      const existing = await client.query(
        'SELECT campaign_id, request_hash FROM campaign_submissions WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey]
      );
      expect(existing.rows.length).toBe(1);
      expect((existing.rows[0] as { request_hash: string }).request_hash).toBe(requestHash);

      const campaignCount = await client.query('SELECT count(*)::int AS cnt FROM campaigns WHERE user_id = $1', [userId]);
      expect(campaignCount.rows[0]).toEqual({ cnt: 1 });

      const jobCount = await client.query('SELECT count(*)::int AS cnt FROM email_jobs WHERE campaign_id = $1', [campaignId]);
      expect(jobCount.rows[0]).toEqual({ cnt: 1 });

      const submissionCount = await client.query('SELECT count(*)::int AS cnt FROM campaign_submissions WHERE user_id = $1 AND idempotency_key = $2', [userId, idempotencyKey]);
      expect(submissionCount.rows[0]).toEqual({ cnt: 1 });
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('same idempotency key + different request hash → 409 conflict (unique constraint)', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const campaignId1 = randomUUID();
      const idempotencyKey = randomUUID();
      const hash1 = 'a'.repeat(64);
      const hash2 = 'b'.repeat(64);

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'idem2@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId1, userId, 'C1', new Date()]);
      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userId, idempotencyKey, hash1, campaignId1, JSON.stringify({ eligibleCount: 5 })]
      );

      const campaignId2 = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId2, userId, 'C2', new Date()]);

      await client.query('SAVEPOINT sp1');
      try {
        await client.query(
          'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
          [userId, idempotencyKey, hash2, campaignId2, JSON.stringify({ eligibleCount: 3 })]
        );
        throw new Error('should have thrown');
      } catch (err) {
        expect(String(err)).toMatch(/unique|duplicate/i);
        await client.query('ROLLBACK TO SAVEPOINT sp1');
      }

      const submissionCount = await client.query('SELECT count(*)::int AS cnt FROM campaign_submissions WHERE user_id = $1 AND idempotency_key = $2', [userId, idempotencyKey]);
      expect(submissionCount.rows[0]).toEqual({ cnt: 1 });

      const storedHash = await client.query('SELECT request_hash FROM campaign_submissions WHERE user_id = $1 AND idempotency_key = $2', [userId, idempotencyKey]);
      expect((storedHash.rows[0] as { request_hash: string }).request_hash).toBe(hash1);
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('different idempotency keys → independent campaigns', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const key1 = randomUUID();
      const key2 = randomUUID();
      const hash = 'c'.repeat(64);

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'idem3@example.com']);

      const campaignId1 = randomUUID();
      const campaignId2 = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId1, userId, 'C1', new Date()]);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId2, userId, 'C2', new Date()]);

      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userId, key1, hash, campaignId1, JSON.stringify({ eligibleCount: 5 })]
      );
      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userId, key2, hash, campaignId2, JSON.stringify({ eligibleCount: 3 })]
      );

      const count = await client.query('SELECT count(*)::int AS cnt FROM campaign_submissions WHERE user_id = $1', [userId]);
      expect(count.rows[0]).toEqual({ cnt: 2 });
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('different users can reuse the same idempotency key', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userA = randomUUID();
      const userB = randomUUID();
      const sameKey = randomUUID();
      const hash = 'd'.repeat(64);

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userA, 'a@example.com']);
      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userB, 'b@example.com']);

      const campaignA = randomUUID();
      const campaignB = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignA, userA, 'CA', new Date()]);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignB, userB, 'CB', new Date()]);

      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userA, sameKey, hash, campaignA, JSON.stringify({ eligibleCount: 1 })]
      );
      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userB, sameKey, hash, campaignB, JSON.stringify({ eligibleCount: 2 })]
      );

      const count = await client.query('SELECT count(*)::int AS cnt FROM campaign_submissions WHERE idempotency_key = $1', [sameKey]);
      expect(count.rows[0]).toEqual({ cnt: 2 });
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('lost-response recovery reuses the same idempotency key', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const campaignId = randomUUID();
      const idempotencyKey = randomUUID();
      const requestHash = 'e'.repeat(64);

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'idem5@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId, userId, 'C', new Date()]);

      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userId, idempotencyKey, requestHash, campaignId, JSON.stringify({ eligibleCount: 10 })]
      );

      const recovery = await client.query(
        'SELECT campaign_id, request_hash, recipient_summary FROM campaign_submissions WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey]
      );
      expect(recovery.rows.length).toBe(1);
      const row = recovery.rows[0] as { campaign_id: string; request_hash: string; recipient_summary: { eligibleCount: number } };
      expect(row.campaign_id).toBe(campaignId);
      expect(row.request_hash).toBe(requestHash);
      expect(row.recipient_summary.eligibleCount).toBe(10);
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);
});
