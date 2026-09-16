import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';
import { describe, expect, it } from 'vitest';

const dotenvParsed = config().parsed;
const connectionString =
  dotenvParsed?.DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required for check-constraints tests');
}

const pool = new Pool({ connectionString });

async function getCheckConstraints(table: string): Promise<Record<string, string>> {
  const { rows } = await pool.query<{ conname: string; def: string }>(`
    SELECT conname, pg_get_constraintdef(oid, true) AS def
    FROM pg_constraint
    WHERE conrelid = '${table}'::regclass AND contype = 'c';
  `);
  return Object.fromEntries(rows.map((r) => [r.conname, r.def]));
}

async function getIndexes(table: string): Promise<Record<string, string>> {
  const { rows } = await pool.query<{ indexname: string; indexdef: string }>(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = '${table}';
  `);
  return Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
}

async function getColumns(table: string): Promise<Record<string, { data_type: string; character_maximum_length: number | null }>> {
  const { rows } = await pool.query<{ column_name: string; data_type: string; character_maximum_length: number | null }>(`
    SELECT column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_name = '${table}';
  `);
  return Object.fromEntries(rows.map((r) => [r.column_name, { data_type: r.data_type, character_maximum_length: r.character_maximum_length }]));
}

async function getForeignKeys(table: string): Promise<Record<string, string>> {
  const { rows } = await pool.query<{ conname: string; def: string }>(`
    SELECT conname, pg_get_constraintdef(oid, true) AS def
    FROM pg_constraint
    WHERE conrelid = '${table}'::regclass AND contype = 'f';
  `);
  return Object.fromEntries(rows.map((r) => [r.conname, r.def]));
}

describe('Prisma CHECK constraints migration', () => {
  it('enforces positive campaign interval and daily limit', async () => {
    const constraints = await getCheckConstraints('campaigns');
    const defs = Object.values(constraints).join('\n');
    expect(defs).toContain('interval_minutes > 0');
    expect(defs).toMatch(/daily_limit IS NULL OR daily_limit > 0/);
  });

  it('enforces non-negative counters on every usage-daily table', async () => {
    for (const table of ['email_usage_daily', 'campaign_usage_daily', 'system_usage_daily']) {
      const constraints = await getCheckConstraints(table);
      const defs = Object.values(constraints).join('\n');
      expect(defs, table).toContain('sent_count >= 0');
      expect(defs, table).toContain('reserved_count >= 0');
    }
  });

  it('keeps the constraints idempotent-safe by naming each constraint', async () => {
    const constraints = await getCheckConstraints('campaigns');
    expect(constraints).toHaveProperty('campaigns_interval_minutes_check');
    expect(constraints).toHaveProperty('campaigns_daily_limit_check');
  });
});

describe('Campaign deduplication migration', () => {
  it('creates the campaign_submissions table with required columns', async () => {
    const columns = await getColumns('campaign_submissions');
    expect(columns).toHaveProperty('idempotency_key');
    expect(columns.idempotency_key.data_type).toBe('uuid');
    expect(columns).toHaveProperty('request_hash');
    expect(columns.request_hash.data_type).toBe('character varying');
    expect(columns.request_hash.character_maximum_length).toBe(64);
    expect(columns).toHaveProperty('recipient_summary');
    expect(columns.recipient_summary.data_type).toBe('jsonb');
    expect(columns).toHaveProperty('resend_recipients');
    expect(columns.resend_recipients.data_type).toBe('jsonb');
  });

  it('enforces unique idempotency key per user and one receipt per campaign', async () => {
    const indexes = await getIndexes('campaign_submissions');
    expect(indexes).toHaveProperty('uq_campaign_submissions_user_key');
    expect(indexes).toHaveProperty('uq_campaign_submissions_campaign_id');
  });

  it('adds the creation_key column and unique index on email_jobs', async () => {
    const columns = await getColumns('email_jobs');
    expect(columns).toHaveProperty('creation_key');
    expect(columns.creation_key.data_type).toBe('character varying');
    expect(columns.creation_key.character_maximum_length).toBe(321);

    const indexes = await getIndexes('email_jobs');
    expect(indexes).toHaveProperty('idx_email_jobs_creation_key_unique');
  });

  it('adds the creation_key validity CHECK constraint', async () => {
    const constraints = await getCheckConstraints('email_jobs');
    expect(constraints).toHaveProperty('email_jobs_creation_key_valid');
    const def = constraints['email_jobs_creation_key_valid'];
    expect(def).toContain('creation_key IS NULL');
  });

  it('adds the recipient history match partial index', async () => {
    const indexes = await getIndexes('email_jobs');
    expect(indexes).toHaveProperty('idx_email_jobs_recipient_history_match');
    const def = indexes['idx_email_jobs_recipient_history_match'];
    expect(def).toContain('WHERE');
    expect(def).toContain('DELIVERY_UNKNOWN');
  });

  it('preserves submission receipts with RESTRICT on campaign delete', async () => {
    const foreignKeys = await getForeignKeys('campaign_submissions');
    expect(foreignKeys).toHaveProperty('campaign_submissions_campaign_id_fkey');
    expect(foreignKeys['campaign_submissions_campaign_id_fkey']).toContain('RESTRICT');
  });
});
