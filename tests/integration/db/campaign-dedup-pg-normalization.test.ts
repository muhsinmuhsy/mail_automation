import { describe, expect, it } from 'vitest';
import { connectionString, beginTest, rollbackTest } from './helpers/dedup-test-setup';

describe.skipIf(!connectionString)('campaign deduplication — PG email normalization (Fix #4)', () => {
  it('lower(btrim()) normalizes whitespace and case consistently', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const emails = [
        'Alice@Example.COM',
        '  bob@test.com  ',
        'BOB@TEST.COM',
        'mixed@Case.Test',
      ];
      const result = await client.query(
        `SELECT original, lower(btrim(original)) AS normalized
         FROM unnest($1::text[]) AS t(original)`,
        [emails]
      );
      const rows = result.rows as Array<{ original: string; normalized: string }>;
      const map = new Map(rows.map((r) => [r.original, r.normalized]));

      expect(map.get('Alice@Example.COM')).toBe('alice@example.com');
      expect(map.get('  bob@test.com  ')).toBe('bob@test.com');
      expect(map.get('BOB@TEST.COM')).toBe('bob@test.com');
      expect(map.get('mixed@Case.Test')).toBe('mixed@case.test');
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('PG normalization matches JS trim().toLowerCase() for ASCII emails', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const emails = [
        'alice@example.com',
        'BOB@TEST.COM',
        '  Charlie@Example.Org  ',
        'user.name+tag@domain.co.uk',
      ];
      const result = await client.query(
        `SELECT original, lower(btrim(original)) AS normalized
         FROM unnest($1::text[]) AS t(original)`,
        [emails]
      );
      const rows = result.rows as Array<{ original: string; normalized: string }>;
      for (const row of rows) {
        expect(row.normalized).toBe(row.original.trim().toLowerCase());
      }
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('PG normalization groups duplicate addresses correctly for history matching', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = '00000000-0000-0000-0000-000000000100';
      const templateId = '00000000-0000-0000-0000-000000000200';
      const accountId = '00000000-0000-0000-0000-000000000300';
      const campaignId = '00000000-0000-0000-0000-000000000400';

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'pgnorm@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'pgnorm@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id) VALUES ($1, $2, $3, $4, $5, $6)', [campaignId, userId, 'C', new Date(), accountId, templateId]);

      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, template_id, email_account_id, to_email, subject, status, sent_at, scheduled_at, creation_key)
         VALUES ($1, $2, $3, $4, $5, $6, 'SENT', now(), now(), $7)`,
        [userId, campaignId, templateId, accountId, 'Alice@Example.COM', 'Subject', `${campaignId}:alice@example.com`]
      );

      const historyMatch = await client.query(
        `SELECT count(*)::int AS cnt
         FROM email_jobs
         WHERE user_id = $1::uuid
           AND template_id = $2::uuid
           AND email_account_id = $3::uuid
           AND lower(btrim(to_email)) = ANY($4::text[])
           AND status = 'SENT'`,
        [userId, templateId, accountId, ['alice@example.com']]
      );
      expect((historyMatch.rows[0] as { cnt: number }).cnt).toBe(1);

      const noMatch = await client.query(
        `SELECT count(*)::int AS cnt
         FROM email_jobs
         WHERE user_id = $1::uuid
           AND template_id = $2::uuid
           AND email_account_id = $3::uuid
           AND lower(btrim(to_email)) = ANY($4::text[])
           AND status = 'SENT'`,
        [userId, templateId, accountId, ['bob@example.com']]
      );
      expect((noMatch.rows[0] as { cnt: number }).cnt).toBe(0);
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('unnest-based normalization handles empty array gracefully', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const result = await client.query(
        `SELECT count(*)::int AS cnt
         FROM unnest($1::text[]) AS t(original)`,
        [[]]
      );
      expect((result.rows[0] as { cnt: number }).cnt).toBe(0);
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);
});
