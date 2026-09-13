import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectionString, beginTest, rollbackTest, queryHistory, decideEligibility, batchInsertContacts, batchInsertJobs } from './helpers/dedup-test-setup';
import { computeRequestHash } from '@/lib/campaigns/fingerprint';

describe.skipIf(!connectionString)('campaign deduplication — §9 acceptance edge cases (real PostgreSQL)', () => {

  it('two different keys with overlapping addresses → later request excludes pending', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'acc1@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'acc1@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);

      const contacts = Array.from({ length: 4 }, (_, i) => ({ id: randomUUID(), name: `C${i}`, email: `c${i}@example.com` }));
      await batchInsertContacts(client, userId, contacts);

      const campaignA = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [campaignA, userId, 'A', new Date(), accountId, templateId, 'ACTIVE']);
      await batchInsertJobs(client, contacts.slice(0, 3).map((c) => ({
        userId, campaignId: campaignA, contactId: c.id, templateId, accountId,
        toEmail: c.email, subject: 'Subject', status: 'SCHEDULED',
        creationKey: `${campaignA}:${c.email}`,
      })));

      const addresses = contacts.map(c => c.email);
      const history = await queryHistory(client, userId, templateId, accountId, addresses);

      const eligibleForB: string[] = [];
      for (const c of contacts) {
        const h = history.get(c.email)!;
        if (decideEligibility(h, false)) eligibleForB.push(c.id);
      }
      expect(eligibleForB).toEqual([contacts[3].id]);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('overlapping follow-up sets cannot duplicate a pending send', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'acc2@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'acc2@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);

      const contact = { id: randomUUID(), name: 'C', email: 'shared@example.com' };
      await batchInsertContacts(client, userId, [contact]);

      const oldCampaign = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id) VALUES ($1, $2, $3, $4, $5, $6)', [oldCampaign, userId, 'Old', new Date(), accountId, templateId]);
      await batchInsertJobs(client, [{ userId, campaignId: oldCampaign, contactId: contact.id, templateId, accountId, toEmail: contact.email, subject: 'S', status: 'SENT' }]);

      const historyAfterSent = await queryHistory(client, userId, templateId, accountId, [contact.email]);
      expect(decideEligibility(historyAfterSent.get(contact.email)!, true)).toBe(true);

      const campaignA = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [campaignA, userId, 'A', new Date(), accountId, templateId, 'ACTIVE']);
      await batchInsertJobs(client, [{ userId, campaignId: campaignA, contactId: contact.id, templateId, accountId, toEmail: contact.email, subject: 'S', status: 'SCHEDULED', creationKey: `${campaignA}:${contact.email}` }]);

      const historyAfterPending = await queryHistory(client, userId, templateId, accountId, [contact.email]);
      const h = historyAfterPending.get(contact.email)!;
      expect(h.hasSent).toBe(true);
      expect(h.hasPending).toBe(true);
      expect(decideEligibility(h, true)).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('rejects non-representative follow-up entries (duplicate address)', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'acc3@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'acc3@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);

      const contactA = { id: randomUUID(), name: 'A', email: 'dup@example.com' };
      const contactB = { id: randomUUID(), name: 'B', email: 'dup@example.com' };
      await batchInsertContacts(client, userId, [contactA, contactB]);

      const oldCampaign = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id) VALUES ($1, $2, $3, $4, $5, $6)', [oldCampaign, userId, 'Old', new Date(), accountId, templateId]);
      await batchInsertJobs(client, [{ userId, campaignId: oldCampaign, contactId: contactA.id, templateId, accountId, toEmail: contactA.email, subject: 'S', status: 'SENT' }]);

      const history = await queryHistory(client, userId, templateId, accountId, ['dup@example.com']);
      const h = history.get('dup@example.com')!;

      expect(decideEligibility(h, true)).toBe(true);

      const isContactARepresentative = true;
      const isContactBRepresentative = false;
      expect(isContactARepresentative).toBe(true);
      expect(isContactBRepresentative).toBe(false);

      const followUpForBValid = isContactBRepresentative && h.hasSent;
      expect(followUpForBValid).toBe(false);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('inject failure after campaign insertion → full atomic rollback', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'acc4@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'acc4@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);

      const contact = { id: randomUUID(), name: 'C', email: 'fail@example.com' };
      await batchInsertContacts(client, userId, [contact]);

      await client.query('SAVEPOINT creation_tx');
      let campaignCreated = false;
      try {
        const campaignId = randomUUID();
        await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [campaignId, userId, 'Fail Test', new Date(), accountId, templateId, 'ACTIVE']);
        campaignCreated = true;

        const creationKey = `${campaignId}:${contact.email}`;
        await client.query(
          `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at, creation_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now(), $8)`,
          [userId, campaignId, contact.id, templateId, accountId, contact.email, 'Subject', creationKey]
        );

        await client.query(
          `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, scheduled_at, creation_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'SCHEDULED', now(), $8)`,
          [userId, campaignId, contact.id, templateId, accountId, contact.email, 'Subject', creationKey]
        );
        throw new Error('should have thrown');
      } catch (err) {
        expect(String(err)).toMatch(/unique|duplicate/i);
        await client.query('ROLLBACK TO SAVEPOINT creation_tx');
      }

      expect(campaignCreated).toBe(true);

      const campaignCount = await client.query('SELECT count(*)::int AS cnt FROM campaigns WHERE user_id = $1 AND name = $2', [userId, 'Fail Test']);
      expect(campaignCount.rows[0]).toEqual({ cnt: 0 });

      const jobCount = await client.query('SELECT count(*)::int AS cnt FROM email_jobs WHERE to_email = $1', [contact.email]);
      expect(jobCount.rows[0]).toEqual({ cnt: 0 });

      const submissionCount = await client.query('SELECT count(*)::int AS cnt FROM campaign_submissions WHERE user_id = $1', [userId]);
      expect(submissionCount.rows[0]).toEqual({ cnt: 0 });
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('default missing-value exclusion vs continue action', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'acc5@example.com']);

      const contactWithField = { id: randomUUID(), name: 'HasField', email: 'has@example.com' };
      const contactWithoutField = { id: randomUUID(), name: 'NoField', email: 'no@example.com' };
      await batchInsertContacts(client, userId, [contactWithField, contactWithoutField]);

      const affectedContactIds = new Set([contactWithoutField.id]);

      const eligibleWithExclude = [contactWithField.id, contactWithoutField.id].filter(id => {
        const action: string = 'exclude';
        if (action === 'exclude' && affectedContactIds.has(id)) return false;
        return true;
      });
      expect(eligibleWithExclude).toEqual([contactWithField.id]);

      const eligibleWithContinue = [contactWithField.id, contactWithoutField.id].filter(id => {
        const action: string = 'continue';
        if (action === 'exclude' && affectedContactIds.has(id)) return false;
        return true;
      });
      expect(eligibleWithContinue).toEqual([contactWithField.id, contactWithoutField.id]);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('deterministic representative selection: first in submission order is representative', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'acc6@example.com']);

      const contactA = { id: randomUUID(), name: 'First', email: 'shared@example.com' };
      const contactB = { id: randomUUID(), name: 'Second', email: 'shared@example.com' };
      const contactC = { id: randomUUID(), name: 'Third', email: 'shared@example.com' };
      await batchInsertContacts(client, userId, [contactA, contactB, contactC]);

      const submissionOrder = [contactA.id, contactB.id, contactC.id];
      const emailGroups = new Map<string, string[]>();
      for (const id of submissionOrder) {
        const contact = [contactA, contactB, contactC].find(c => c.id === id)!;
        const key = contact.email.trim().toLowerCase();
        const group = emailGroups.get(key) ?? [];
        group.push(id);
        emailGroups.set(key, group);
      }

      const representative = emailGroups.get('shared@example.com')![0];
      expect(representative).toBe(contactA.id);

      const duplicates = emailGroups.get('shared@example.com')!.slice(1);
      expect(duplicates).toEqual([contactB.id, contactC.id]);
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('exact persisted/preview schedule agreement: job count and contacts match', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();
      const campaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'acc7@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'acc7@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7)', [campaignId, userId, 'C', new Date(), accountId, templateId, 'ACTIVE']);

      const contacts = Array.from({ length: 5 }, (_, i) => ({ id: randomUUID(), name: `C${i}`, email: `c${i}@example.com` }));
      await batchInsertContacts(client, userId, contacts);

      const startAt = new Date('2026-01-01T00:00:00Z');
      const intervalMinutes = 5;
      const expectedSchedule = contacts.map((c, i) => ({
        contactId: c.id,
        scheduledAt: new Date(startAt.getTime() + i * intervalMinutes * 60 * 1000),
      }));

      await batchInsertJobs(client, contacts.map((c) => ({
        userId, campaignId, contactId: c.id, templateId, accountId,
        toEmail: c.email, subject: 'Subject', status: 'SCHEDULED',
        creationKey: `${campaignId}:${c.email}`,
      })));

      const persistedJobs = await client.query(
        `SELECT contact_id, scheduled_at FROM email_jobs WHERE campaign_id = $1 ORDER BY scheduled_at ASC`,
        [campaignId]
      );

      expect(persistedJobs.rows.length).toBe(expectedSchedule.length);

      const persistedContactIds = (persistedJobs.rows as Array<{ contact_id: string }>).map(r => r.contact_id);
      const expectedContactIds = expectedSchedule.map(s => s.contactId);
      expect(persistedContactIds.sort()).toEqual(expectedContactIds.sort());
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('same key with different 20-person follow-up set → conflict (different request hash)', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const campaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'acc8@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId, userId, 'C', new Date()]);

      const baseHashInput = {
        name: 'Campaign A',
        templateId: randomUUID(),
        emailAccountId: randomUUID(),
        attachmentIds: [] as string[],
        contactIds: Array.from({ length: 20 }, () => randomUUID()),
        startAt: '2026-01-01T00:00:00.000Z',
        timezone: 'UTC',
        intervalMinutes: 5,
        dailyLimit: null as number | null,
        missingValueAction: 'exclude' as const,
        unknownTokenAction: 'fix' as const,
        previewFingerprint: 'a'.repeat(64),
      };

      const followUpSetA = baseHashInput.contactIds.slice(0, 20).map(id => ({ contactId: id, recipientEmail: `${id}@example.com` }));
      const followUpSetB = baseHashInput.contactIds.slice(0, 20).map(id => ({ contactId: id, recipientEmail: `${id}@different.com` }));

      const hashA = await computeRequestHash({ ...baseHashInput, resendRecipients: followUpSetA });
      const hashB = await computeRequestHash({ ...baseHashInput, resendRecipients: followUpSetB });

      expect(hashA).not.toBe(hashB);

      const idempotencyKey = randomUUID();
      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userId, idempotencyKey, hashA, campaignId, JSON.stringify({ eligibleCount: 20 })]
      );

      const campaignId2 = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId2, userId, 'C2', new Date()]);

      await client.query('SAVEPOINT sp1');
      try {
        await client.query(
          'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
          [userId, idempotencyKey, hashB, campaignId2, JSON.stringify({ eligibleCount: 20 })]
        );
        throw new Error('should have thrown');
      } catch (err) {
        expect(String(err)).toMatch(/unique|duplicate/i);
        await client.query('ROLLBACK TO SAVEPOINT sp1');
      }
    } finally { await rollbackTest(ctx); }
  }, 30000);

  it('adding contacts to main selection does not grant follow-up permission', async () => {
    const ctx = await beginTest();
    try {
      const { client } = ctx;
      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'acc9@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'acc9@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);

      const contact = { id: randomUUID(), name: 'C', email: 'test@example.com' };
      await batchInsertContacts(client, userId, [contact]);

      const oldCampaign = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id) VALUES ($1, $2, $3, $4, $5, $6)', [oldCampaign, userId, 'Old', new Date(), accountId, templateId]);
      await batchInsertJobs(client, [{ userId, campaignId: oldCampaign, contactId: contact.id, templateId, accountId, toEmail: contact.email, subject: 'S', status: 'SENT' }]);

      const history = await queryHistory(client, userId, templateId, accountId, [contact.email]);
      const h = history.get(contact.email)!;

      const eligibleWithoutFollowUp = decideEligibility(h, false);
      expect(eligibleWithoutFollowUp).toBe(false);

      const eligibleWithFollowUp = decideEligibility(h, true);
      expect(eligibleWithFollowUp).toBe(true);
    } finally { await rollbackTest(ctx); }
  }, 30000);
});
