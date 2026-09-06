import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from '@neondatabase/serverless';
import { describe, expect, it } from 'vitest';

const connectionString = process.env.OAUTH_MIGRATION_TEST_DATABASE_URL;
describe.skipIf(!connectionString)('Gmail migration (isolated PostgreSQL transaction)', () => {
  it('preserves existing SMTP accounts and atomically consumes authorization attempts', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const schema = `oauth_test_${randomUUID().replaceAll('-', '')}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(`CREATE TYPE "EmailProvider" AS ENUM ('gmail', 'microsoft', 'yahoo', 'custom_smtp')`);
      await client.query(`CREATE TABLE email_accounts (id uuid PRIMARY KEY, encrypted_secret text)`);
      const id = randomUUID();
      await client.query('INSERT INTO email_accounts VALUES ($1, $2)', [id, 'existing-encrypted-smtp']);
      await client.query(readFileSync('prisma/migrations/20260906_gmail_oauth/migration.sql', 'utf8'));
      expect((await client.query('SELECT encrypted_secret, granted_scopes FROM email_accounts')).rows).toEqual([{ encrypted_secret: 'existing-encrypted-smtp', granted_scopes: [] }]);
      await client.query(`INSERT INTO email_oauth_attempts VALUES ('state-hash', $1, 'gmail', NULL, 'encrypted-verifier', NOW() + INTERVAL '10 minutes')`, [id]);
      expect((await client.query(`DELETE FROM email_oauth_attempts WHERE state_hash = 'state-hash' RETURNING state_hash`)).rowCount).toBe(1);
      expect((await client.query(`DELETE FROM email_oauth_attempts WHERE state_hash = 'state-hash' RETURNING state_hash`)).rowCount).toBe(0);
    } finally {
      await client.query('ROLLBACK'); client.release(); await pool.end();
    }
  }, 30000);
});
