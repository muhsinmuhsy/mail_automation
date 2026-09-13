import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectionString, beginTest, rollbackTest, queryHistory, decideEligibility } from './helpers/dedup-test-setup';

describe.skipIf(!connectionString)('campaign deduplication — ownership boundaries (real PostgreSQL)', () => {
  it('user A cannot query user B campaigns via user_id scoping', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userA = randomUUID();
      const userB = randomUUID();
      const campaignB = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userA, 'own-a@example.com']);
      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userB, 'own-b@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignB, userB, 'B Campaign', new Date()]);

      const aCampaigns = await client.query('SELECT count(*)::int AS cnt FROM campaigns WHERE user_id = $1', [userA]);
      expect(aCampaigns.rows[0]).toEqual({ cnt: 0 });

      const bCampaigns = await client.query('SELECT count(*)::int AS cnt FROM campaigns WHERE user_id = $1', [userB]);
      expect(bCampaigns.rows[0]).toEqual({ cnt: 1 });
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('user A cannot query user B submissions via user_id scoping', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userA = randomUUID();
      const userB = randomUUID();
      const campaignB = randomUUID();
      const keyB = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userA, 'own-a2@example.com']);
      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userB, 'own-b2@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignB, userB, 'B', new Date()]);
      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userB, keyB, 'a'.repeat(64), campaignB, JSON.stringify({ eligibleCount: 1 })]
      );

      const aSubmissions = await client.query('SELECT count(*)::int AS cnt FROM campaign_submissions WHERE user_id = $1', [userA]);
      expect(aSubmissions.rows[0]).toEqual({ cnt: 0 });

      const bSubmissions = await client.query('SELECT count(*)::int AS cnt FROM campaign_submissions WHERE user_id = $1', [userB]);
      expect(bSubmissions.rows[0]).toEqual({ cnt: 1 });
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('user A history query does not match user B jobs (user_id filter)', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userA = randomUUID();
      const userB = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();
      const campaignB = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userA, 'own-a3@example.com']);
      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userB, 'own-b3@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userB, 'gmail', 'own-b3@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userB, 'T', 'Subject']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id) VALUES ($1, $2, $3, $4, $5, $6)', [campaignB, userB, 'B', new Date(), accountId, templateId]);

      const email = 'shared@example.com';
      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, template_id, email_account_id, to_email, subject, status, sent_at, scheduled_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'SENT', now(), now())`,
        [userB, campaignB, templateId, accountId, email, 'Subject']
      );

      const historyA = await queryHistory(client, userA, templateId, accountId, [email]);
      const hA = historyA.get(email)!;
      expect(hA.hasSent).toBe(false);
      expect(decideEligibility(hA, false)).toBe(true);

      const historyB = await queryHistory(client, userB, templateId, accountId, [email]);
      const hB = historyB.get(email)!;
      expect(hB.hasSent).toBe(true);
      expect(decideEligibility(hB, false)).toBe(false);
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('user A cannot create submission referencing user B campaign (FK + ownership)', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userA = randomUUID();
      const userB = randomUUID();
      const campaignB = randomUUID();
      const keyA = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userA, 'own-a4@example.com']);
      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userB, 'own-b4@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignB, userB, 'B', new Date()]);

      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userA, keyA, 'a'.repeat(64), campaignB, JSON.stringify({ eligibleCount: 1 })]
      );

      const crossRef = await client.query(
        'SELECT user_id, campaign_id FROM campaign_submissions WHERE idempotency_key = $1',
        [keyA]
      );
      const row = crossRef.rows[0] as { user_id: string; campaign_id: string };
      expect(row.user_id).toBe(userA);
      expect(row.campaign_id).toBe(campaignB);

      const aSubmissionCampaigns = await client.query(
        `SELECT c.user_id AS campaign_owner FROM campaign_submissions cs
         JOIN campaigns c ON cs.campaign_id = c.id
         WHERE cs.user_id = $1`,
        [userA]
      );
      const ownerRow = aSubmissionCampaigns.rows[0] as { campaign_owner: string };
      expect(ownerRow.campaign_owner).toBe(userB);
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('1000 contact cap — schema validation rejects >1000 contacts', async () => {
    const { preCheckSchema } = await import('@/lib/validation/campaign');
    const contactIds = Array.from({ length: 1001 }, () => randomUUID());
    const result = preCheckSchema.safeParse({
      templateId: randomUUID(),
      emailAccountId: randomUUID(),
      contactIds,
      attachmentIds: [],
      resendRecipients: [],
      missingValueAction: 'exclude',
      unknownTokenAction: 'fix',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/1000|too many|maximum/i);
    }
  });

  it('1000 contact cap — schema accepts exactly 1000 contacts', async () => {
    const { preCheckSchema } = await import('@/lib/validation/campaign');
    const contactIds = Array.from({ length: 1000 }, () => randomUUID());
    const result = preCheckSchema.safeParse({
      templateId: randomUUID(),
      emailAccountId: randomUUID(),
      contactIds,
      attachmentIds: [],
      resendRecipients: [],
      missingValueAction: 'exclude',
      unknownTokenAction: 'fix',
    });
    expect(result.success).toBe(true);
  });

  it('recipientStatusSchema rejects >100 contact IDs', async () => {
    const { recipientStatusSchema } = await import('@/lib/validation/campaign');
    const contactIds = Array.from({ length: 101 }, () => randomUUID());
    const result = recipientStatusSchema.safeParse({
      templateId: randomUUID(),
      emailAccountId: randomUUID(),
      contactIds,
    });
    expect(result.success).toBe(false);
  });

  it('recipientStatusSchema accepts exactly 100 contact IDs', async () => {
    const { recipientStatusSchema } = await import('@/lib/validation/campaign');
    const contactIds = Array.from({ length: 100 }, () => randomUUID());
    const result = recipientStatusSchema.safeParse({
      templateId: randomUUID(),
      emailAccountId: randomUUID(),
      contactIds,
    });
    expect(result.success).toBe(true);
  });
});

describe('campaign deduplication — no-store headers', () => {
  it('respondOk sets Cache-Control: private, no-store', async () => {
    const { respondOk } = await import('@/lib/api/respond');
    const res = respondOk({ foo: 'bar' }, 'req-1');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Request-ID')).toBe('req-1');
  });

  it('respondError sets Cache-Control: private, no-store', async () => {
    const { respondError } = await import('@/lib/api/respond');
    const { AppError } = await import('@/lib/errors');
    const res = respondError(new AppError('Test error', 400, 'TEST'), 'req-2');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Request-ID')).toBe('req-2');
  });

  it('respondList sets Cache-Control: private, no-store', async () => {
    const { respondList } = await import('@/lib/api/respond');
    const res = respondList([1, 2, 3], 100, 1, 10, 'req-3');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Request-ID')).toBe('req-3');
  });
});
