import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260910020208_initail/migration.sql'),
  'utf8'
);

const dedupMigration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260913120000_campaign_deduplication/migration.sql'),
  'utf8'
);

function tableBlock(table: string): string {
  const re = new RegExp(`ALTER TABLE "${table}"[^;]+;`, 'g');
  return migration.match(re)?.join('\n') ?? '';
}

describe('Prisma CHECK constraints migration', () => {
  it('enforces positive campaign interval and daily limit', () => {
    const block = tableBlock('campaigns');
    expect(block).toContain('"interval_minutes" > 0');
    expect(block).toContain('"daily_limit" IS NULL OR "daily_limit" > 0');
  });

  it('enforces non-negative counters on every usage-daily table', () => {
    for (const table of ['email_usage_daily', 'campaign_usage_daily', 'system_usage_daily']) {
      const block = tableBlock(table);
      expect(block, table).toContain('"sent_count" >= 0');
      expect(block, table).toContain('"reserved_count" >= 0');
    }
  });

  it('keeps the constraints idempotent-safe by naming each constraint', () => {
    expect(migration).toMatch(/ADD CONSTRAINT "campaigns_interval_minutes_check"/);
    expect(migration).toMatch(/ADD CONSTRAINT "campaigns_daily_limit_check"/);
  });
});

describe('Campaign deduplication migration', () => {
  it('creates the campaign_submissions table with required columns', () => {
    expect(dedupMigration).toContain('CREATE TABLE "campaign_submissions"');
    expect(dedupMigration).toContain('"idempotency_key" UUID NOT NULL');
    expect(dedupMigration).toContain('"request_hash" VARCHAR(64) NOT NULL');
    expect(dedupMigration).toContain('"recipient_summary" JSONB NOT NULL');
    expect(dedupMigration).toContain('"resend_recipients" JSONB NOT NULL DEFAULT \'[]\'');
  });

  it('enforces unique idempotency key per user and one receipt per campaign', () => {
    expect(dedupMigration).toContain('CREATE UNIQUE INDEX "uq_campaign_submissions_user_key"');
    expect(dedupMigration).toContain('"user_id", "idempotency_key"');
    expect(dedupMigration).toContain('CREATE UNIQUE INDEX "uq_campaign_submissions_campaign_id"');
  });

  it('adds the creation_key column and unique index on email_jobs', () => {
    expect(dedupMigration).toContain('ADD COLUMN "creation_key" VARCHAR(321)');
    expect(dedupMigration).toContain('CREATE UNIQUE INDEX "idx_email_jobs_creation_key_unique"');
  });

  it('adds the creation_key validity CHECK constraint', () => {
    expect(dedupMigration).toMatch(/ADD CONSTRAINT "email_jobs_creation_key_valid"/);
    expect(dedupMigration).toContain('creation_key IS NULL');
    expect(dedupMigration).toContain('campaign_id::text || \':\' || lower(btrim(to_email))');
  });

  it('adds the recipient history match partial index', () => {
    expect(dedupMigration).toContain('CREATE INDEX "idx_email_jobs_recipient_history_match"');
    expect(dedupMigration).toContain('WHERE status IN');
    expect(dedupMigration).toContain("'DELIVERY_UNKNOWN'");
  });

  it('preserves submission receipts with RESTRICT on campaign delete', () => {
    expect(dedupMigration).toContain('CONSTRAINT "campaign_submissions_campaign_id_fkey"');
    expect(dedupMigration).toContain('ON DELETE RESTRICT');
  });
});
