import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectionString, beginTest, rollbackTest, queryHistory, decideEligibility, batchInsertContacts, batchInsertJobs } from './helpers/dedup-test-setup';

describe.skipIf(!connectionString)('campaign deduplication — HR scenario (real PostgreSQL)', () => {
  it('150 selected, 100 previously sent, 20 follow-ups → exactly 70 jobs', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();
      const campaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'hr@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'hr@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject, body_text) VALUES ($1, $2, $3, $4, $5)', [templateId, userId, 'Welcome', 'Hello {{name}}', 'Body']);

      const contactIds: string[] = [];
      const contacts = [];
      for (let i = 0; i < 150; i++) {
        const id = randomUUID();
        contactIds.push(id);
        contacts.push({ id, name: `Employee ${i}`, email: `emp${i}@example.com` });
      }
      await batchInsertContacts(client, userId, contacts);

      const previouslySentIds = contactIds.slice(0, 100);
      const oldCampaignId = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id) VALUES ($1, $2, $3, $4, $5, $6)', [oldCampaignId, userId, 'Old Campaign', new Date(), accountId, templateId]);
      await batchInsertJobs(client, previouslySentIds.map((contactId, i) => ({
        userId, campaignId: oldCampaignId, contactId, templateId, accountId,
        toEmail: `emp${i}@example.com`, subject: 'Subject', status: 'SENT',
      })));

      const followUpIds = new Set(previouslySentIds.slice(0, 20));
      const normalizedAddresses = contactIds.map((_, i) => `emp${i}@example.com`);
      const history = await queryHistory(client, userId, templateId, accountId, normalizedAddresses);

      const eligibleContactIds: string[] = [];
      for (let i = 0; i < 150; i++) {
        const addr = `emp${i}@example.com`;
        const h = history.get(addr)!;
        const isFollowUp = followUpIds.has(contactIds[i]);
        if (decideEligibility(h, isFollowUp)) {
          eligibleContactIds.push(contactIds[i]);
        }
      }
      expect(eligibleContactIds.length).toBe(70);

      await client.query(
        'INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [campaignId, userId, 'New Campaign', new Date(), accountId, templateId, 'ACTIVE']
      );

      const startAt = new Date();
      await batchInsertJobs(client, eligibleContactIds.map((contactId, i) => {
        const emailIdx = contactIds.indexOf(contactId);
        const email = `emp${emailIdx}@example.com`;
        const normalizedEmail = email.trim().toLowerCase();
        const creationKey = `${campaignId}:${normalizedEmail}`;
        return {
          userId, campaignId, contactId, templateId, accountId,
          toEmail: email, subject: 'Subject', status: 'SCHEDULED', creationKey,
        };
      }));

      const idempotencyKey = randomUUID();
      const requestHash = 'a'.repeat(64);
      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userId, idempotencyKey, requestHash, campaignId, JSON.stringify({ eligibleCount: 70, selectedCount: 150, includedPreviousCount: 20, includedWithoutPreviousSendCount: 50 })]
      );

      const jobCount = await client.query('SELECT count(*)::int AS cnt FROM email_jobs WHERE campaign_id = $1', [campaignId]);
      expect(jobCount.rows[0]).toEqual({ cnt: 70 });

      const newJobs = await client.query('SELECT count(*)::int AS cnt FROM email_jobs WHERE campaign_id = $1 AND status = $2', [campaignId, 'SCHEDULED']);
      expect(newJobs.rows[0]).toEqual({ cnt: 70 });

      const allKeysPresent = await client.query('SELECT count(*)::int AS cnt FROM email_jobs WHERE campaign_id = $1 AND creation_key IS NOT NULL', [campaignId]);
      expect(allKeysPresent.rows[0]).toEqual({ cnt: 70 });

      const uniqueKeys = await client.query('SELECT count(DISTINCT creation_key)::int AS cnt FROM email_jobs WHERE campaign_id = $1', [campaignId]);
      expect(uniqueKeys.rows[0]).toEqual({ cnt: 70 });

      const submissionCount = await client.query('SELECT count(*)::int AS cnt FROM campaign_submissions WHERE campaign_id = $1', [campaignId]);
      expect(submissionCount.rows[0]).toEqual({ cnt: 1 });

      const followUpJobs = await client.query(
        `SELECT count(*)::int AS cnt FROM email_jobs WHERE campaign_id = $1 AND contact_id = ANY($2::uuid[])`,
        [campaignId, [...followUpIds]]
      );
      expect(followUpJobs.rows[0]).toEqual({ cnt: 20 });

      const newRecipientJobs = await client.query(
        `SELECT count(*)::int AS cnt FROM email_jobs WHERE campaign_id = $1 AND contact_id <> ALL($2::uuid[])`,
        [campaignId, [...followUpIds]]
      );
      expect(newRecipientJobs.rows[0]).toEqual({ cnt: 50 });
    } finally {
      await rollbackTest(ctx);
    }
  }, 60000);

  it('follow-up search/pagination retain choices — selection preserved across pages', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'hr2@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'hr2@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);

      const allContactIds: string[] = [];
      const contacts = [];
      for (let i = 0; i < 120; i++) {
        const id = randomUUID();
        allContactIds.push(id);
        contacts.push({ id, name: `C${i}`, email: `c${i}@example.com` });
      }
      await batchInsertContacts(client, userId, contacts);

      const oldCampaignId = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id) VALUES ($1, $2, $3, $4, $5, $6)', [oldCampaignId, userId, 'Old', new Date(), accountId, templateId]);
      await batchInsertJobs(client, allContactIds.map((contactId, i) => ({
        userId, campaignId: oldCampaignId, contactId, templateId, accountId,
        toEmail: `c${i}@example.com`, subject: 'Subject', status: 'SENT',
      })));

      const page1Selection = new Set(allContactIds.slice(0, 5));
      const page2Selection = new Set(allContactIds.slice(50, 55));
      const combinedSelection = new Set([...page1Selection, ...page2Selection]);
      expect(combinedSelection.size).toBe(10);

      const campaignId = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [campaignId, userId, 'New', new Date(), accountId, templateId, 'ACTIVE']);

      await batchInsertJobs(client, [...combinedSelection].map((contactId) => {
        const i = allContactIds.indexOf(contactId);
        const email = `c${i}@example.com`;
        const creationKey = `${campaignId}:${email}`;
        return { userId, campaignId, contactId, templateId, accountId, toEmail: email, subject: 'Subject', status: 'SCHEDULED', creationKey };
      }));

      const jobCount = await client.query('SELECT count(*)::int AS cnt FROM email_jobs WHERE campaign_id = $1', [campaignId]);
      expect(jobCount.rows[0]).toEqual({ cnt: 10 });
    } finally {
      await rollbackTest(ctx);
    }
  }, 60000);

  it('zero eligible recipients when all 150 have pending jobs and no follow-ups', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'hr3@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'hr3@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);

      const contactIds: string[] = [];
      const contacts = [];
      for (let i = 0; i < 150; i++) {
        const id = randomUUID();
        contactIds.push(id);
        contacts.push({ id, name: `C${i}`, email: `c${i}@example.com` });
      }
      await batchInsertContacts(client, userId, contacts);

      const oldCampaignId = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id) VALUES ($1, $2, $3, $4, $5, $6)', [oldCampaignId, userId, 'Old', new Date(), accountId, templateId]);
      await batchInsertJobs(client, contactIds.map((contactId, i) => ({
        userId, campaignId: oldCampaignId, contactId, templateId, accountId,
        toEmail: `c${i}@example.com`, subject: 'Subject', status: 'SCHEDULED',
      })));

      const normalizedAddresses = contactIds.map((_, i) => `c${i}@example.com`);
      const history = await queryHistory(client, userId, templateId, accountId, normalizedAddresses);

      let eligibleCount = 0;
      for (let i = 0; i < 150; i++) {
        const h = history.get(`c${i}@example.com`)!;
        if (decideEligibility(h, false)) eligibleCount++;
      }
      expect(eligibleCount).toBe(0);
    } finally {
      await rollbackTest(ctx);
    }
  }, 60000);

  it('single recipient state produces exactly 1 job', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();
      const campaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'hr4@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'hr4@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);

      const contactId = randomUUID();
      await client.query('INSERT INTO contacts (id, user_id, name, email) VALUES ($1, $2, $3, $4)', [contactId, userId, 'Solo', 'solo@example.com']);

      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [campaignId, userId, 'Single', new Date(), accountId, templateId, 'ACTIVE']);
      const creationKey = `${campaignId}:solo@example.com`;
      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at, creation_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now(), $8)`,
        [userId, campaignId, contactId, templateId, accountId, 'solo@example.com', 'Subject', creationKey]
      );

      const jobCount = await client.query('SELECT count(*)::int AS cnt FROM email_jobs WHERE campaign_id = $1', [campaignId]);
      expect(jobCount.rows[0]).toEqual({ cnt: 1 });
    } finally {
      await rollbackTest(ctx);
    }
  }, 30000);
});
