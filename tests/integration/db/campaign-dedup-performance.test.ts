import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectionString, beginTest, rollbackTest, queryHistory, batchInsertContacts } from './helpers/dedup-test-setup';

describe.skipIf(!connectionString)('campaign deduplication — performance (real PostgreSQL)', () => {
  it('pre-check with 100K historical jobs and 1000 selected contacts completes under 5s', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();
      const oldCampaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'perf@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'perf@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id) VALUES ($1, $2, $3, $4, $5, $6)', [oldCampaignId, userId, 'Old', new Date(), accountId, templateId]);

      const contacts = Array.from({ length: 1000 }, (_, i) => ({
        id: randomUUID(),
        name: `Contact${i}`,
        email: `perf${i}@example.com`,
      }));
      await batchInsertContacts(client, userId, contacts);

      const contactIds = contacts.map(c => c.id);
      const contactEmails = contacts.map(c => c.email);

      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, sent_at, scheduled_at)
         SELECT
           $1::uuid,
           $2::uuid,
           unnest($3::uuid[]),
           $4::uuid,
           $5::uuid,
           unnest($6::text[]),
           'Subject',
           'SENT',
           now(),
           now()
         FROM generate_series(1, 100)`,
        [userId, oldCampaignId, contactIds, templateId, accountId, contactEmails]
      );

      const totalJobs = await client.query('SELECT count(*)::int AS cnt FROM email_jobs WHERE campaign_id = $1', [oldCampaignId]);
      const jobCount = (totalJobs.rows[0] as { cnt: number }).cnt;
      expect(jobCount).toBe(100000);

      const addresses = contacts.map(c => c.email);

      const queryStart = Date.now();
      const history = await queryHistory(client, userId, templateId, accountId, addresses);
      const queryMs = Date.now() - queryStart;

      let eligibleCount = 0;
      for (const addr of addresses) {
        const h = history.get(addr)!;
        if (!h.hasSent && !h.hasPending && !h.hasDeliveryUnknown) {
          eligibleCount++;
        }
      }

      expect(eligibleCount).toBe(0);
      expect(queryMs).toBeLessThan(5000);

      console.log(`[perf] 100K jobs, 1000 contacts: history query = ${queryMs}ms`);
    } finally {
      await rollbackTest(ctx);
    }
  }, 120000);

  it('pre-check with no history and 1000 contacts completes under 1s', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'perf2@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'perf2@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);

      const contacts = Array.from({ length: 1000 }, (_, i) => ({
        id: randomUUID(),
        name: `Contact${i}`,
        email: `perf2_${i}@example.com`,
      }));
      await batchInsertContacts(client, userId, contacts);

      const addresses = contacts.map(c => c.email);

      const queryStart = Date.now();
      const history = await queryHistory(client, userId, templateId, accountId, addresses);
      const queryMs = Date.now() - queryStart;

      let eligibleCount = 0;
      for (const addr of addresses) {
        const h = history.get(addr)!;
        if (!h.hasSent && !h.hasPending && !h.hasDeliveryUnknown) {
          eligibleCount++;
        }
      }

      expect(eligibleCount).toBe(1000);
      expect(queryMs).toBeLessThan(1000);

      console.log(`[perf] 0 jobs, 1000 contacts: history query = ${queryMs}ms`);
    } finally {
      await rollbackTest(ctx);
    }
  }, 60000);
});
