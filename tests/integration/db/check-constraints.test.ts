import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260831_domain_checks/migration.sql'),
  'utf8'
);

function tableBlock(table: string): string {
  const start = migration.indexOf(`ALTER TABLE "${table}"`);
  if (start === -1) return '';
  // Constraint additions end at the first semicolon after the ALTER TABLE.
  const end = migration.indexOf(';', start);
  return migration.slice(start, end === -1 ? undefined : end);
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
