import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectionString, beginTest, rollbackTest, queryHistory, decideEligibility } from './helpers/dedup-test-setup';

describe.skipIf(!connectionString)('campaign deduplication — status combinations (real PostgreSQL)', () => {
  async function setupBase(ctx: Awaited<ReturnType<typeof beginTest>>) {
    const { client } = ctx;
    const userId = randomUUID();
    const templateId = randomUUID();
    const accountId = randomUUID();
    const oldCampaignId = randomUUID();

    await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `sc-${randomUUID()}@example.com`]);
    await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'sc@example.com']);
    await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);
    await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id) VALUES ($1, $2, $3, $4, $5, $6)', [oldCampaignId, userId, 'Old', new Date(), accountId, templateId]);

    const contactId = randomUUID();
    const email = `c-${randomUUID()}@example.com`;
    await client.query('INSERT INTO contacts (id, user_id, name, email) VALUES ($1, $2, $3, $4)', [contactId, userId, 'C', email]);

    return { userId, templateId, accountId, oldCampaignId, contactId, email };
  }

  async function insertJob(
    client: Awaited<ReturnType<typeof beginTest>>['client'],
    userId: string, campaignId: string, templateId: string, accountId: string,
    email: string, status: string
  ) {
    const sentAt = status === 'SENT' ? 'now()' : null;
    await client.query(
      `INSERT INTO email_jobs (user_id, campaign_id, template_id, email_account_id, to_email, subject, status, sent_at, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::"EmailJobStatus", ${sentAt}, now())`,
      [userId, campaignId, templateId, accountId, email, 'Subject', status]
    );
  }

  it('SENT only → excluded as PREVIOUSLY_SENT (without follow-up)', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'SENT');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasSent).toBe(true);
      expect(h.hasPending).toBe(false);
      expect(h.hasDeliveryUnknown).toBe(false);
      expect(decideEligibility(h, false)).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('SENT + follow-up selected → eligible', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'SENT');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(decideEligibility(h, true)).toBe(true);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('SCHEDULED (pending) → excluded as PENDING', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'SCHEDULED');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasPending).toBe(true);
      expect(decideEligibility(h, false)).toBe(false);
      expect(decideEligibility(h, true)).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('QUEUED (pending) → excluded as PENDING', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'QUEUED');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasPending).toBe(true);
      expect(decideEligibility(h, false)).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('PROCESSING (pending) → excluded as PENDING', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'PROCESSING');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasPending).toBe(true);
      expect(decideEligibility(h, false)).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('RETRY_WAIT (pending) → excluded as PENDING', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'RETRY_WAIT');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasPending).toBe(true);
      expect(decideEligibility(h, false)).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('DELIVERY_UNKNOWN → excluded as DELIVERY_UNKNOWN (even with follow-up)', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'DELIVERY_UNKNOWN');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasDeliveryUnknown).toBe(true);
      expect(decideEligibility(h, false)).toBe(false);
      expect(decideEligibility(h, true)).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('FAILED only → eligible (not in history match)', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'FAILED');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasSent).toBe(false);
      expect(h.hasPending).toBe(false);
      expect(h.hasDeliveryUnknown).toBe(false);
      expect(decideEligibility(h, false)).toBe(true);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('CANCELLED only → eligible (not in history match)', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'CANCELLED');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasSent).toBe(false);
      expect(h.hasPending).toBe(false);
      expect(decideEligibility(h, false)).toBe(true);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('mixed SENT + PENDING → excluded as PENDING (precedence: PENDING > PREVIOUSLY_SENT)', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'SENT');
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'SCHEDULED');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasSent).toBe(true);
      expect(h.hasPending).toBe(true);
      expect(decideEligibility(h, false)).toBe(false);
      expect(decideEligibility(h, true)).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('mixed SENT + DELIVERY_UNKNOWN → excluded as DELIVERY_UNKNOWN (highest precedence)', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'SENT');
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'DELIVERY_UNKNOWN');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasSent).toBe(true);
      expect(h.hasDeliveryUnknown).toBe(true);
      expect(decideEligibility(h, false)).toBe(false);
      expect(decideEligibility(h, true)).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('mixed PENDING + DELIVERY_UNKNOWN → excluded as DELIVERY_UNKNOWN (highest precedence)', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'SCHEDULED');
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'DELIVERY_UNKNOWN');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasPending).toBe(true);
      expect(h.hasDeliveryUnknown).toBe(true);
      expect(decideEligibility(h, false)).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('mixed FAILED + CANCELLED → eligible (neither in history match)', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'FAILED');
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'CANCELLED');
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasSent).toBe(false);
      expect(h.hasPending).toBe(false);
      expect(h.hasDeliveryUnknown).toBe(false);
      expect(decideEligibility(h, false)).toBe(true);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('paused campaign SCHEDULED jobs still count as PENDING', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();
      const pausedCampaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'pause@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'pause@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [pausedCampaignId, userId, 'Paused', new Date(), accountId, templateId, 'PAUSED']);

      const contactId = randomUUID();
      const email = 'paused@example.com';
      await client.query('INSERT INTO contacts (id, user_id, name, email) VALUES ($1, $2, $3, $4)', [contactId, userId, 'C', email]);
      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now())`,
        [userId, pausedCampaignId, contactId, templateId, accountId, email, 'Subject']
      );

      const history = await queryHistory(ctx.client, userId, templateId, accountId, [email]);
      const h = history.get(email)!;
      expect(h.hasPending).toBe(true);
      expect(decideEligibility(h, false)).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('unknown recovery: DELIVERY_UNKNOWN blocks even after SENT exists', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'SENT');
      await insertJob(ctx.client, base.userId, base.oldCampaignId, base.templateId, base.accountId, base.email, 'DELIVERY_UNKNOWN');

      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasSent).toBe(true);
      expect(h.hasDeliveryUnknown).toBe(true);
      expect(decideEligibility(h, true)).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('no history at all → eligible', async () => {
    const ctx = await beginTest();
    try {
      const base = await setupBase(ctx);
      const history = await queryHistory(ctx.client, base.userId, base.templateId, base.accountId, [base.email]);
      const h = history.get(base.email)!;
      expect(h.hasSent).toBe(false);
      expect(h.hasPending).toBe(false);
      expect(h.hasDeliveryUnknown).toBe(false);
      expect(decideEligibility(h, false)).toBe(true);
    } finally { await rollbackTest(ctx); }
  }, 30000);
});
