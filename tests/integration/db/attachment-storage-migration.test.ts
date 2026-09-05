import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from '@neondatabase/serverless';
import { describe, expect, it } from 'vitest';

const connectionString = process.env.ATTACHMENT_MIGRATION_TEST_DATABASE_URL;
const migration = readFileSync(
  'prisma/migrations/20260905_resume_storage_key/migration.sql', 'utf8',
);

// Opt in with a PostgreSQL test database. Every case runs in an isolated
// schema and rolls back, including when an assertion fails.
describe.skipIf(!connectionString)('attachment storage migration (real PostgreSQL)', () => {
  it.each(['r2_key', 'storage_key'])('preserves data and permits uploads from %s', async (column) => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const schema = `resume_test_${randomUUID().replaceAll('-', '')}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(`CREATE TABLE resumes (id integer PRIMARY KEY, "${column}" varchar(1024) NOT NULL)`);
      await client.query(`INSERT INTO resumes VALUES (1, 'resumes/existing.pdf')`);
      await client.query(migration);
      await client.query(migration);
      expect((await client.query('SELECT storage_key FROM resumes WHERE id = 1')).rows)
        .toEqual([{ storage_key: 'resumes/existing.pdf' }]);
      await client.query(`INSERT INTO resumes (id, storage_key) VALUES (2, 'resumes/new.pdf')`);
      expect((await client.query('SELECT storage_key FROM resumes WHERE id = 2')).rows)
        .toEqual([{ storage_key: 'resumes/new.pdf' }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);
});
