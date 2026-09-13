import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';
import { describe, expect, it } from 'vitest';

const dotenvParsed = config().parsed;
const connectionString =
  dotenvParsed?.CAMPAIGN_DEDUP_TEST_DATABASE_URL ??
  dotenvParsed?.CONTACT_FIELDS_TEST_DATABASE_URL ??
  dotenvParsed?.OAUTH_MIGRATION_TEST_DATABASE_URL ??
  dotenvParsed?.DATABASE_URL ??
  process.env.CAMPAIGN_DEDUP_TEST_DATABASE_URL ??
  process.env.CONTACT_FIELDS_TEST_DATABASE_URL ??
  process.env.OAUTH_MIGRATION_TEST_DATABASE_URL ??
  process.env.DATABASE_URL;

const schemaSetupSql = `
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "EmailJobStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED', 'RETRY_WAIT', 'DELIVERY_UNKNOWN');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) NOT NULL,
  "name" VARCHAR(255),
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "daily_email_limit_override" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "email_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider" VARCHAR(50) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "subject" TEXT NOT NULL,
  "body_text" TEXT,
  "body_html" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" VARCHAR(100),
  "email" VARCHAR(255) NOT NULL,
  "import_session_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "email_account_id" UUID,
  "template_id" UUID,
  "start_at" TIMESTAMPTZ NOT NULL,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
  "interval_minutes" INTEGER NOT NULL DEFAULT 5,
  "daily_limit" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaigns_interval_minutes_check" CHECK ("interval_minutes" > 0),
  CONSTRAINT "campaigns_daily_limit_check" CHECK ("daily_limit" IS NULL OR "daily_limit" > 0)
);

CREATE TABLE "email_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "campaign_id" UUID,
  "contact_id" UUID,
  "template_id" UUID,
  "email_account_id" UUID,
  "to_email" VARCHAR(255) NOT NULL,
  "subject" TEXT NOT NULL,
  "body_text" TEXT,
  "body_html" TEXT,
  "status" "EmailJobStatus" NOT NULL DEFAULT 'SCHEDULED',
  "scheduled_at" TIMESTAMPTZ,
  "sent_at" TIMESTAMPTZ,
  "creation_key" VARCHAR(321),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "email_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idx_email_jobs_creation_key_unique" ON "email_jobs"("creation_key");
CREATE INDEX "idx_email_jobs_recipient_history_match"
  ON "email_jobs" ("user_id", "template_id", "email_account_id", lower(btrim("to_email")))
  WHERE status IN ('SENT', 'SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT', 'DELIVERY_UNKNOWN');

ALTER TABLE "email_jobs"
ADD CONSTRAINT "email_jobs_creation_key_valid"
CHECK (
  creation_key IS NULL
  OR (
    campaign_id IS NOT NULL
    AND creation_key = campaign_id::text || ':' || lower(btrim(to_email))
  )
);

CREATE TABLE "campaign_submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "campaign_id" UUID NOT NULL,
  "recipient_summary" JSONB NOT NULL,
  "resend_recipients" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_campaign_submissions_user_key"
  ON "campaign_submissions" ("user_id", "idempotency_key");
CREATE UNIQUE INDEX "uq_campaign_submissions_campaign_id"
  ON "campaign_submissions" ("campaign_id");
CREATE INDEX "idx_campaign_submissions_user_created"
  ON "campaign_submissions" ("user_id", "created_at");

ALTER TABLE "campaign_submissions" ADD CONSTRAINT "campaign_submissions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_submissions" ADD CONSTRAINT "campaign_submissions_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
`;

async function setupSchema(client: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) {
  const schema = `cd_test_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query(schemaSetupSql);
  return schema;
}

describe.skipIf(!connectionString)('campaign deduplication concurrency (real PostgreSQL)', () => {
  it('creation_key uniqueness prevents duplicate jobs in one campaign', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setupSchema(client);

      const userId = randomUUID();
      const campaignId = randomUUID();
      const contactEmail = 'alice@example.com';
      const creationKey = `${campaignId}:${contactEmail}`;

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId, userId, 'Test', new Date()]);
      await client.query(
        'INSERT INTO email_jobs (user_id, campaign_id, to_email, subject, creation_key, scheduled_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, campaignId, contactEmail, 'Subject', creationKey, new Date()]
      );

      await expect(
        client.query(
          'INSERT INTO email_jobs (user_id, campaign_id, to_email, subject, creation_key, scheduled_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [userId, campaignId, contactEmail, 'Subject', creationKey, new Date()]
        )
      ).rejects.toThrow(/unique|duplicate/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);

  it('creation_key CHECK constraint rejects mismatched campaign_id', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setupSchema(client);

      const userId = randomUUID();
      const campaignId = randomUUID();
      const wrongKey = `${randomUUID()}:alice@example.com`;

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId, userId, 'Test', new Date()]);

      await expect(
        client.query(
          'INSERT INTO email_jobs (user_id, campaign_id, to_email, subject, creation_key, scheduled_at) VALUES ($1, $2, $3, $4, $5, $6)',
          [userId, campaignId, 'alice@example.com', 'Subject', wrongKey, new Date()]
        )
      ).rejects.toThrow(/check|constraint/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);

  it('creation_key CHECK constraint rejects null campaign_id with non-null key', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setupSchema(client);

      const userId = randomUUID();
      const key = `${randomUUID()}:alice@example.com`;

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);

      await expect(
        client.query(
          'INSERT INTO email_jobs (user_id, to_email, subject, creation_key, scheduled_at) VALUES ($1, $2, $3, $4, $5)',
          [userId, 'alice@example.com', 'Subject', key, new Date()]
        )
      ).rejects.toThrow(/check|constraint/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);

  it('legacy null creation_key allows multiple rows', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setupSchema(client);

      const userId = randomUUID();
      const campaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId, userId, 'Test', new Date()]);

      await client.query(
        'INSERT INTO email_jobs (user_id, campaign_id, to_email, subject, scheduled_at) VALUES ($1, $2, $3, $4, $5)',
        [userId, campaignId, 'alice@example.com', 'Subject', new Date()]
      );
      await client.query(
        'INSERT INTO email_jobs (user_id, campaign_id, to_email, subject, scheduled_at) VALUES ($1, $2, $3, $4, $5)',
        [userId, campaignId, 'alice@example.com', 'Subject', new Date()]
      );

      const result = await client.query('SELECT count(*)::int as cnt FROM email_jobs WHERE campaign_id = $1 AND creation_key IS NULL', [campaignId]);
      expect(result.rows[0]).toEqual({ cnt: 2 });
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);

  it('campaign_submission unique (user_id, idempotency_key) prevents duplicate receipts', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setupSchema(client);

      const userId = randomUUID();
      const campaignId = randomUUID();
      const idempotencyKey = randomUUID();
      const requestHash = 'a'.repeat(64);

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId, userId, 'Test', new Date()]);
      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userId, idempotencyKey, requestHash, campaignId, JSON.stringify({ eligibleCount: 5 })]
      );

      const campaignId2 = randomUUID();
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId2, userId, 'Test 2', new Date()]);
      await expect(
        client.query(
          'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
          [userId, idempotencyKey, requestHash, campaignId2, JSON.stringify({ eligibleCount: 3 })]
        )
      ).rejects.toThrow(/unique|duplicate/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);

  it('campaign_submission unique campaign_id ensures one receipt per campaign', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setupSchema(client);

      const userId = randomUUID();
      const campaignId = randomUUID();
      const key1 = randomUUID();
      const key2 = randomUUID();
      const requestHash = 'b'.repeat(64);

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId, userId, 'Test', new Date()]);
      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userId, key1, requestHash, campaignId, JSON.stringify({ eligibleCount: 5 })]
      );

      await expect(
        client.query(
          'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
          [userId, key2, requestHash, campaignId, JSON.stringify({ eligibleCount: 3 })]
        )
      ).rejects.toThrow(/unique|duplicate/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);

  it('per-user advisory lock serializes same-user creation', async () => {
    const pool = new Pool({ connectionString });
    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query('BEGIN');
      const schema = await setupSchema(clientA);

      const userId = randomUUID();
      await clientA.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      await clientA.query('COMMIT');

      const lockKeySql = `SELECT hashtextextended('campaign-create:v1:${userId}', 0)`;
      const lockResult = await clientA.query(lockKeySql);
      const lockKey = lockResult.rows[0] as { hashtextextended: string };

      await clientA.query('BEGIN');
      await clientA.query(`SET LOCAL search_path TO "${schema}"`);
      await clientA.query('SELECT pg_advisory_xact_lock($1)', [lockKey.hashtextextended]);

      await clientB.query(`SET search_path TO "${schema}"`);
      const lockAcquired = await Promise.race([
        clientB.query('SELECT pg_try_advisory_lock($1) as acquired', [lockKey.hashtextextended]).then(r => (r.rows[0] as { acquired: boolean }).acquired),
        new Promise<boolean>(resolve => setTimeout(() => resolve(true), 500)),
      ]);
      expect(lockAcquired).toBe(false);

      await clientA.query('COMMIT');

      await clientB.query('BEGIN');
      await clientB.query(`SET LOCAL search_path TO "${schema}"`);
      const acquiredAfterCommit = await clientB.query('SELECT pg_try_advisory_lock($1) as acquired', [lockKey.hashtextextended]);
      expect((acquiredAfterCommit.rows[0] as { acquired: boolean }).acquired).toBe(true);
      await clientB.query('SELECT pg_advisory_unlock($1)', [lockKey.hashtextextended]);
      await clientB.query('COMMIT');
    } finally {
      try { await clientA.query('ROLLBACK'); } catch { /* */ }
      try { await clientB.query('ROLLBACK'); } catch { /* */ }
      clientA.release();
      clientB.release();
      await pool.end();
    }
  }, 30000);

  it('different users can create campaigns concurrently (different lock keys)', async () => {
    const pool = new Pool({ connectionString });
    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query('BEGIN');
      const schema = await setupSchema(clientA);

      const userA = randomUUID();
      const userB = randomUUID();
      await clientA.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userA, 'a@example.com']);
      await clientA.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userB, 'b@example.com']);
      await clientA.query('COMMIT');

      const lockKeyA = (await clientA.query(`SELECT hashtextextended('campaign-create:v1:${userA}', 0) as k`)).rows[0] as { k: string };
      const lockKeyB = (await clientA.query(`SELECT hashtextextended('campaign-create:v1:${userB}', 0) as k`)).rows[0] as { k: string };

      await clientA.query('BEGIN');
      await clientA.query(`SET LOCAL search_path TO "${schema}"`);
      await clientA.query('SELECT pg_advisory_xact_lock($1)', [lockKeyA.k]);

      await clientB.query('BEGIN');
      await clientB.query(`SET LOCAL search_path TO "${schema}"`);
      const acquiredB = await clientB.query('SELECT pg_try_advisory_lock($1) as acquired', [lockKeyB.k]);
      expect((acquiredB.rows[0] as { acquired: boolean }).acquired).toBe(true);
      await clientB.query('SELECT pg_advisory_unlock($1)', [lockKeyB.k]);
      await clientB.query('COMMIT');

      await clientA.query('COMMIT');
    } finally {
      try { await clientA.query('ROLLBACK'); } catch { /* */ }
      try { await clientB.query('ROLLBACK'); } catch { /* */ }
      clientA.release();
      clientB.release();
      await pool.end();
    }
  }, 30000);

  it('recipient history index matches by normalized email (case-insensitive, trimmed)', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setupSchema(client);

      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();
      const campaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'sender@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id) VALUES ($1, $2, $3, $4, $5, $6)', [campaignId, userId, 'C', new Date(), accountId, templateId]);

      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, template_id, email_account_id, to_email, subject, status, sent_at, scheduled_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'SENT', now(), now())`,
        [userId, campaignId, templateId, accountId, '  Alice@Example.COM  ', 'Subject']
      );

      const result = await client.query(
        `SELECT count(*)::int as cnt FROM email_jobs
         WHERE user_id = $1 AND template_id = $2 AND email_account_id = $3
         AND lower(btrim(to_email)) = lower(btrim($4))
         AND status IN ('SENT', 'SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT', 'DELIVERY_UNKNOWN')`,
        [userId, templateId, accountId, 'alice@example.com']
      );
      expect(result.rows[0]).toEqual({ cnt: 1 });
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);

  it('partial index excludes CANCELLED and FAILED from history match', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setupSchema(client);

      const userId = randomUUID();
      const templateId = randomUUID();
      const accountId = randomUUID();
      const campaignId = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      await client.query('INSERT INTO email_accounts (id, user_id, provider, email) VALUES ($1, $2, $3, $4)', [accountId, userId, 'gmail', 'sender@example.com']);
      await client.query('INSERT INTO templates (id, user_id, name, subject) VALUES ($1, $2, $3, $4)', [templateId, userId, 'T', 'Subject']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at, email_account_id, template_id) VALUES ($1, $2, $3, $4, $5, $6)', [campaignId, userId, 'C', new Date(), accountId, templateId]);

      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, template_id, email_account_id, to_email, subject, status, scheduled_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'FAILED', now())`,
        [userId, campaignId, templateId, accountId, 'bob@example.com', 'Subject']
      );
      await client.query(
        `INSERT INTO email_jobs (user_id, campaign_id, template_id, email_account_id, to_email, subject, status, scheduled_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'CANCELLED', now())`,
        [userId, campaignId, templateId, accountId, 'bob@example.com', 'Subject']
      );

      const result = await client.query(
        `SELECT count(*)::int as cnt FROM email_jobs
         WHERE user_id = $1 AND template_id = $2 AND email_account_id = $3
         AND lower(btrim(to_email)) = lower(btrim($4))
         AND status IN ('SENT', 'SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT', 'DELIVERY_UNKNOWN')`,
        [userId, templateId, accountId, 'bob@example.com']
      );
      expect(result.rows[0]).toEqual({ cnt: 0 });
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);

  it('campaign_submission FK RESTRICT prevents deleting a campaign with a receipt', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setupSchema(client);

      const userId = randomUUID();
      const campaignId = randomUUID();
      const idempotencyKey = randomUUID();

      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      await client.query('INSERT INTO campaigns (id, user_id, name, start_at) VALUES ($1, $2, $3, $4)', [campaignId, userId, 'Test', new Date()]);
      await client.query(
        'INSERT INTO campaign_submissions (user_id, idempotency_key, request_hash, campaign_id, recipient_summary) VALUES ($1, $2, $3, $4, $5)',
        [userId, idempotencyKey, 'c'.repeat(64), campaignId, JSON.stringify({ eligibleCount: 1 })]
      );

      await expect(
        client.query('DELETE FROM campaigns WHERE id = $1', [campaignId])
      ).rejects.toThrow(/foreign key|restrict/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);
});
