import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'prisma/migrations/20260910020208_initail/migration.sql', 'utf8',
);

describe('attachment storage_key column (consolidated migration)', () => {
  it('creates attachments table with storage_key column', () => {
    expect(migration).toContain('"storage_key" VARCHAR(1024) NOT NULL');
    expect(migration).toContain('CREATE TABLE "attachments"');
  });

  it('does not reference the old r2_key column', () => {
    expect(migration).not.toContain('r2_key');
  });
});
