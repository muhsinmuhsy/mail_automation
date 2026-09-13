import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Pool, type PoolClient } from '@neondatabase/serverless';

const dotenvParsed = config().parsed;
export const connectionString =
  dotenvParsed?.CAMPAIGN_DEDUP_TEST_DATABASE_URL ??
  dotenvParsed?.CONTACT_FIELDS_TEST_DATABASE_URL ??
  dotenvParsed?.OAUTH_MIGRATION_TEST_DATABASE_URL ??
  dotenvParsed?.DATABASE_URL ??
  process.env.CAMPAIGN_DEDUP_TEST_DATABASE_URL ??
  process.env.CONTACT_FIELDS_TEST_DATABASE_URL ??
  process.env.OAUTH_MIGRATION_TEST_DATABASE_URL ??
  process.env.DATABASE_URL;

export const schemaSetupSql = `
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

export type DbClient = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

export async function setupSchema(client: DbClient): Promise<string> {
  const schema = `cd_test_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query(schemaSetupSql);
  return schema;
}

export interface TestContext {
  pool: Pool;
  client: PoolClient;
  schema: string;
}

export async function beginTest(): Promise<TestContext> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  await client.query('BEGIN');
  const schema = await setupSchema(client);
  return { pool, client, schema };
}

export async function rollbackTest(ctx: TestContext): Promise<void> {
  try {
    await ctx.client.query('ROLLBACK');
  } catch {
    // already rolled back
  }
  ctx.client.release();
  await ctx.pool.end();
}

export async function queryHistory(
  client: DbClient,
  userId: string,
  templateId: string,
  emailAccountId: string,
  normalizedAddresses: string[]
): Promise<Map<string, { hasSent: boolean; hasPending: boolean; hasDeliveryUnknown: boolean; sentCount: number }>> {
  const historyMap = new Map<string, { hasSent: boolean; hasPending: boolean; hasDeliveryUnknown: boolean; sentCount: number }>();
  for (const addr of normalizedAddresses) {
    historyMap.set(addr, { hasSent: false, hasPending: false, hasDeliveryUnknown: false, sentCount: 0 });
  }
  if (normalizedAddresses.length === 0) return historyMap;

  const rows = await client.query(
    `SELECT lower(btrim(to_email)) AS normalized_email, status, count(*)::int AS cnt
     FROM email_jobs
     WHERE user_id = $1::uuid
       AND template_id = $2::uuid
       AND email_account_id = $3::uuid
       AND lower(btrim(to_email)) = ANY($4::text[])
       AND status IN ('SENT', 'SCHEDULED', 'QUEUED', 'PROCESSING', 'RETRY_WAIT', 'DELIVERY_UNKNOWN')
     GROUP BY lower(btrim(to_email)), status`,
    [userId, templateId, emailAccountId, normalizedAddresses]
  );

  for (const row of rows.rows as Array<{ normalized_email: string; status: string; cnt: number }>) {
    const entry = historyMap.get(row.normalized_email);
    if (!entry) continue;
    if (row.status === 'SENT') {
      entry.hasSent = true;
      entry.sentCount = row.cnt;
    } else if (row.status === 'DELIVERY_UNKNOWN') {
      entry.hasDeliveryUnknown = true;
    } else {
      entry.hasPending = true;
    }
  }

  return historyMap;
}

export function decideEligibility(history: { hasSent: boolean; hasPending: boolean; hasDeliveryUnknown: boolean }, followUpSelected: boolean): boolean {
  if (history.hasDeliveryUnknown) return false;
  if (history.hasPending) return false;
  if (history.hasSent && !followUpSelected) return false;
  return true;
}

export async function batchInsertContacts(
  client: DbClient,
  userId: string,
  contacts: Array<{ id: string; name: string; email: string }>
): Promise<void> {
  if (contacts.length === 0) return;
  const ids = contacts.map((c) => c.id);
  const userIds = contacts.map(() => userId);
  const names = contacts.map((c) => c.name);
  const emails = contacts.map((c) => c.email);
  await client.query(
    `INSERT INTO contacts (id, user_id, name, email)
     SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[])`,
    [ids, userIds, names, emails]
  );
}

export async function batchInsertJobs(
  client: DbClient,
  jobs: Array<{
    userId: string; campaignId: string; contactId?: string;
    templateId?: string; accountId?: string;
    toEmail: string; subject: string; status: string;
    creationKey?: string;
  }>
): Promise<void> {
  if (jobs.length === 0) return;
  const userIds = jobs.map((j) => j.userId);
  const campaignIds = jobs.map((j) => j.campaignId);
  const contactIds = jobs.map((j) => j.contactId ?? null);
  const templateIds = jobs.map((j) => j.templateId ?? null);
  const accountIds = jobs.map((j) => j.accountId ?? null);
  const toEmails = jobs.map((j) => j.toEmail);
  const subjects = jobs.map((j) => j.subject);
  const statuses = jobs.map((j) => j.status);
  const creationKeys = jobs.map((j) => j.creationKey ?? null);
  await client.query(
    `INSERT INTO email_jobs (user_id, campaign_id, contact_id, template_id, email_account_id, to_email, subject, status, sent_at, scheduled_at, creation_key)
     SELECT
       u, c, ct, t, a, e, s, st::"EmailJobStatus",
       CASE WHEN st = 'SENT' THEN now() ELSE NULL END,
       now(), ck
     FROM unnest(
       $1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[],
       $6::text[], $7::text[], $8::text[], $9::text[]
     ) AS t(u, c, ct, t, a, e, s, st, ck)`,
    [userIds, campaignIds, contactIds, templateIds, accountIds, toEmails, subjects, statuses, creationKeys]
  );
}
