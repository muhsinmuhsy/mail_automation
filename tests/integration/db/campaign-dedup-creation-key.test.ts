import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectionString, beginTest, rollbackTest } from './helpers/dedup-test-setup';

describe.skipIf(!connectionString)('campaign deduplication — creation-key atomic rollback (real PostgreSQL)', () => {
  it('creation_key conflict in same campaign — duplicate insert rejected, prior job preserved', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();
      const campaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'ck1@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'ck1@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [campaignId, userId, 'C', new Date(), accountId, templateId, 'ACTIVE']);

      const contactId = randomUUID();
      await client.query('INSERT INTO contacts (id, user_id, name, email) VALUES ($1, $2, $3, $4)', [contactId, userId, 'C', 'dup@example.com']);
      const creationKey = `${campaignId}:dup@example.com`;

      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at, creation_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now(), $8)`,
        [userId, campaignId, contactId, templateId, accountId, 'dup@example.com', 'Subject', creationKey]
      );

      await client.query('SAVEPOINT sp1');
      try {
        await client.query(
          `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at, creation_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now(), $8)`,
          [userId, campaignId, contactId, templateId, accountId, 'dup@example.com', 'Subject', creationKey]
        );
        throw new Error('should have thrown');
      } catch (err) {
        expect(String(err)).toMatch(/unique|duplicate/i);
        await client.query('ROLLBACK TO SAVEPOINT sp1');
      }

      const jobCount = await client.query('SELECT count(*)::int AS cnt FROM email_jobs WHERE campaign_id = $1 AND to_email = $2', [campaignId, 'dup@example.com']);
      expect(jobCount.rows[0]).toEqual({ cnt: 1 });
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('SAVEPOINT rollback on creation_key conflict preserves prior jobs in same transaction', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();
      const campaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'ck2@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'ck2@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [campaignId, userId, 'C', new Date(), accountId, templateId, 'ACTIVE']);

      const contact1 = randomUUID();
      const contact2 = randomUUID();
      await client.query('INSERT INTO contacts (id, user_id, name, email) VALUES ($1, $2, $3, $4)', [contact1, userId, 'C1', 'first@example.com']);
      await client.query('INSERT INTO contacts (id, user_id, name, email) VALUES ($1, $2, $3, $4)', [contact2, userId, 'C2', 'second@example.com']);

      const key1 = `${campaignId}:first@example.com`;
      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at, creation_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now(), $8)`,
        [userId, campaignId, contact1, templateId, accountId, 'first@example.com', 'Subject', key1]
      );

      await client.query('SAVEPOINT sp1');
      try {
        await client.query(
          `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at, creation_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now(), $8)`,
          [userId, campaignId, contact1, templateId, accountId, 'first@example.com', 'Subject', key1]
        );
        throw new Error('should have thrown');
      } catch (err) {
        expect(String(err)).toMatch(/unique|duplicate/i);
        await client.query('ROLLBACK TO SAVEPOINT sp1');
      }

      const key2 = `${campaignId}:second@example.com`;
      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at, creation_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now(), $8)`,
        [userId, campaignId, contact2, templateId, accountId, 'second@example.com', 'Subject', key2]
      );

      const jobCount = await client.query('SELECT count(*)::int AS cnt FROM email_jobs WHERE campaign_id = $1', [campaignId]);
      expect(jobCount.rows[0]).toEqual({ cnt: 2 });
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('full transaction rollback on creation_key conflict — no campaign, no jobs, no submission', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'ck3@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'ck3@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);

      const contactId = randomUUID();
      await client.query('INSERT INTO contacts (id, user_id, name, email) VALUES ($1, $2, $3, $4)', [contactId, userId, 'C', 'shared@example.com']);

      const campaignA = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [campaignA, userId, 'A', new Date(), accountId, templateId, 'ACTIVE']);
      const keyA = `${campaignA}:shared@example.com`;
      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at, creation_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now(), $8)`,
        [userId, campaignA, contactId, templateId, accountId, 'shared@example.com', 'Subject', keyA]
      );

      await client.query('SAVEPOINT creation_tx');
      let campaignBCreated = false;
      try {
        const campaignB = randomUUID();
        await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [campaignB, userId, 'B', new Date(), accountId, templateId, 'ACTIVE']);
        campaignBCreated = true;

        const keyB = `${campaignB}:shared@example.com`;
        await client.query(
          `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at, creation_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now(), $8)`,
          [userId, campaignB, contactId, templateId, accountId, 'shared@example.com', 'Subject', keyB]
        );

        await client.query(
          `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at, creation_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now(), $8)`,
          [userId, campaignB, contactId, templateId, accountId, 'shared@example.com', 'Subject', keyB]
        );
        throw new Error('should have thrown');
      } catch (err) {
        expect(String(err)).toMatch(/unique|duplicate/i);
        await client.query('ROLLBACK TO SAVEPOINT creation_tx');
      }

      const campaignCount = await client.query('SELECT count(*)::int AS cnt FROM campaigns WHERE user_id = $1', [userId]);
      expect(campaignCount.rows[0]).toEqual({ cnt: 1 });

      const submissionCount = await client.query('SELECT count(*)::int AS cnt FROM campaign_submissions WHERE user_id = $1', [userId]);
      expect(submissionCount.rows[0]).toEqual({ cnt: 0 });

      expect(campaignBCreated).toBe(true);
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);

  it('CHECK constraint prevents creation_key with mismatched campaign_id format', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const campaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'ck4@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId, userId, 'C', new Date()]);

      await client.query('SAVEPOINT sp1');
      try {
        const wrongKey = `${randomUUID()}:test@example.com`;
        await client.query(
          `INSERT INTO email_jobs (user_id, campaign_id, to_email, subject, status, scheduled_at, creation_key)
           VALUES ($1, $2, $3, $4, 'SCHEDULED', now(), $5)`,
          [userId, campaignId, 'test@example.com', 'Subject', wrongKey]
        );
        throw new Error('should have thrown');
      } catch (err) {
        expect(String(err)).toMatch(/check|constraint/i);
        await client.query('ROLLBACK TO SAVEPOINT sp1');
      }
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);
});
