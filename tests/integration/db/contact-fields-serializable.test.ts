import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';
import { describe, expect, it } from 'vitest';

const dotenvParsed = config().parsed;
const connectionString =
  dotenvParsed?.CONTACT_FIELDS_TEST_DATABASE_URL ??
  dotenvParsed?.OAUTH_MIGRATION_TEST_DATABASE_URL ??
  dotenvParsed?.DATABASE_URL ??
  process.env.CONTACT_FIELDS_TEST_DATABASE_URL ??
  process.env.OAUTH_MIGRATION_TEST_DATABASE_URL ??
  process.env.DATABASE_URL;

const migrationSql = `
CREATE TYPE "FieldType" AS ENUM ('text', 'number', 'date', 'boolean');

CREATE TABLE "contact_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "field_type" "FieldType" NOT NULL DEFAULT 'text',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_field_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contact_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_field_values_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_contact_fields_user_id" ON "contact_fields"("user_id");
CREATE UNIQUE INDEX "unique_contact_fields_user_id_name" ON "contact_fields"("user_id", "name");
CREATE INDEX "idx_contact_field_values_field_id" ON "contact_field_values"("field_id");
CREATE UNIQUE INDEX "unique_contact_field_values_contact_id_field_id" ON "contact_field_values"("contact_id", "field_id");

ALTER TABLE "contact_fields" ADD CONSTRAINT "contact_fields_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_field_values" ADD CONSTRAINT "contact_field_values_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_field_values" ADD CONSTRAINT "contact_field_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "contact_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

describe.skipIf(!connectionString)('contact-fields serializable concurrency (real PostgreSQL)', () => {
  it('unique constraint on (user_id, name) prevents duplicate tokens', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const schema = `cf_test_${randomUUID().replaceAll('-', '')}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(`CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER')`);
      await client.query(`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) UNIQUE NOT NULL, name varchar(255), role "UserRole" NOT NULL DEFAULT 'USER', is_active boolean NOT NULL DEFAULT true, daily_email_limit_override integer, created_at timestamptz NOT NULL DEFAULT now())`);
      await client.query(`CREATE TABLE contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, name varchar(100), email varchar(255) NOT NULL, import_session_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
      await client.query(migrationSql);

      const userId = randomUUID();
      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);

      await client.query(
        'INSERT INTO contact_fields (user_id, name, label, field_type) VALUES ($1, $2, $3, $4)',
        [userId, 'size', 'T-shirt Size', 'text']
      );

      await expect(
        client.query(
          'INSERT INTO contact_fields (user_id, name, label, field_type) VALUES ($1, $2, $3, $4)',
          [userId, 'size', 'Another Size', 'text']
        )
      ).rejects.toThrow(/unique|duplicate/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);

  it('foreign key on contact_field_values.field_id blocks orphan writes', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const schema = `cf_test_${randomUUID().replaceAll('-', '')}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(`CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER')`);
      await client.query(`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) UNIQUE NOT NULL, name varchar(255), role "UserRole" NOT NULL DEFAULT 'USER', is_active boolean NOT NULL DEFAULT true, daily_email_limit_override integer, created_at timestamptz NOT NULL DEFAULT now())`);
      await client.query(`CREATE TABLE contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, name varchar(100), email varchar(255) NOT NULL, import_session_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
      await client.query(migrationSql);

      const userId = randomUUID();
      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      const contactId = randomUUID();
      await client.query('INSERT INTO contacts (id, user_id, name, email) VALUES ($1, $2, $3, $4)', [contactId, userId, 'Alice', 'alice@example.com']);

      const fakeFieldId = randomUUID();
      await expect(
        client.query(
          'INSERT INTO contact_field_values (contact_id, field_id, value) VALUES ($1, $2, $3)',
          [contactId, fakeFieldId, 'M']
        )
      ).rejects.toThrow(/foreign key|violates/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);

  it('version column optimistic-lock: concurrent updates with same version — exactly one succeeds', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const schema = `cf_test_${randomUUID().replaceAll('-', '')}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(`CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER')`);
      await client.query(`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) UNIQUE NOT NULL, name varchar(255), role "UserRole" NOT NULL DEFAULT 'USER', is_active boolean NOT NULL DEFAULT true, daily_email_limit_override integer, created_at timestamptz NOT NULL DEFAULT now())`);
      await client.query(`CREATE TABLE contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, name varchar(100), email varchar(255) NOT NULL, import_session_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
      await client.query(migrationSql);

      const userId = randomUUID();
      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      const fieldResult = await client.query(
        'INSERT INTO contact_fields (user_id, name, label, field_type) VALUES ($1, $2, $3, $4) RETURNING id, version',
        [userId, 'size', 'T-shirt Size', 'text']
      );
      const fieldId = fieldResult.rows[0].id;
      const version = fieldResult.rows[0].version;

      const update1 = await client.query(
        'UPDATE contact_fields SET label = $1, version = version + 1 WHERE id = $2 AND user_id = $3 AND version = $4',
        ['Label A', fieldId, userId, version]
      );
      expect(update1.rowCount).toBe(1);

      const update2 = await client.query(
        'UPDATE contact_fields SET label = $1, version = version + 1 WHERE id = $2 AND user_id = $3 AND version = $4',
        ['Label B', fieldId, userId, version]
      );
      expect(update2.rowCount).toBe(0);

      const final = await client.query('SELECT label, version FROM contact_fields WHERE id = $1', [fieldId]);
      expect(final.rows[0].label).toBe('Label A');
      expect(final.rows[0].version).toBe(version + 1);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);

  it('Serializable isolation aborts on interleaved write (P2034)', async () => {
    const pool = new Pool({ connectionString });
    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query('BEGIN');
      const schema = `cf_test_${randomUUID().replaceAll('-', '')}`;
      await clientA.query(`CREATE SCHEMA "${schema}"`);
      await clientA.query(`SET LOCAL search_path TO "${schema}"`);
      await clientA.query(`CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER')`);
      await clientA.query(`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) UNIQUE NOT NULL, name varchar(255), role "UserRole" NOT NULL DEFAULT 'USER', is_active boolean NOT NULL DEFAULT true, daily_email_limit_override integer, created_at timestamptz NOT NULL DEFAULT now())`);
      await clientA.query(`CREATE TABLE contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, name varchar(100), email varchar(255) NOT NULL, import_session_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
      await clientA.query(migrationSql);

      const userId = randomUUID();
      await clientA.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      const fieldResult = await clientA.query(
        'INSERT INTO contact_fields (user_id, name, label, field_type) VALUES ($1, $2, $3, $4) RETURNING id',
        [userId, 'size', 'T-shirt Size', 'text']
      );
      const fieldId = fieldResult.rows[0].id;
      await clientA.query('COMMIT');

      await clientA.query('BEGIN');
      await clientA.query(`SET LOCAL search_path TO "${schema}"`);
      await clientA.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      await clientA.query('SELECT label FROM contact_fields WHERE id = $1', [fieldId]);

      await clientB.query(`SET search_path TO "${schema}"`);
      await clientB.query(
        'UPDATE contact_fields SET label = $1, version = version + 1 WHERE id = $2',
        ['Changed by B', fieldId]
      );

      await expect(
        clientA.query('UPDATE contact_fields SET label = $1, version = version + 1 WHERE id = $2', ['Changed by A', fieldId])
      ).rejects.toThrow(/could not serialize|P2034|concurrent/i);

      await clientA.query('ROLLBACK');
    } finally {
      try { await clientA.query('ROLLBACK'); } catch { /* already rolled back */ }
      clientA.release();
      clientB.release();
      await pool.end();
    }
  }, 30000);

  it('retry after P2034 succeeds with updated data', async () => {
    const pool = new Pool({ connectionString });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const schema = `cf_test_${randomUUID().replaceAll('-', '')}`;
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(`CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER')`);
      await client.query(`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(255) UNIQUE NOT NULL, name varchar(255), role "UserRole" NOT NULL DEFAULT 'USER', is_active boolean NOT NULL DEFAULT true, daily_email_limit_override integer, created_at timestamptz NOT NULL DEFAULT now())`);
      await client.query(`CREATE TABLE contacts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, name varchar(100), email varchar(255) NOT NULL, import_session_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
      await client.query(migrationSql);

      const userId = randomUUID();
      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'test@example.com']);
      const fieldResult = await client.query(
        'INSERT INTO contact_fields (user_id, name, label, field_type) VALUES ($1, $2, $3, $4) RETURNING id, version',
        [userId, 'size', 'T-shirt Size', 'text']
      );
      const fieldId = fieldResult.rows[0].id;
      const initialVersion = fieldResult.rows[0].version;

      await client.query(
        'UPDATE contact_fields SET label = $1, version = version + 1 WHERE id = $2',
        ['Updated concurrently', fieldId]
      );

      const retryResult = await client.query(
        'UPDATE contact_fields SET label = $1, version = version + 1 WHERE id = $2 AND user_id = $3 AND version = $4 RETURNING label, version',
        ['Retry update', fieldId, userId, initialVersion]
      );
      expect(retryResult.rowCount).toBe(0);

      const freshRead = await client.query('SELECT version FROM contact_fields WHERE id = $1', [fieldId]);
      const currentVersion = freshRead.rows[0].version;
      const retry2 = await client.query(
        'UPDATE contact_fields SET label = $1, version = version + 1 WHERE id = $2 AND user_id = $3 AND version = $4 RETURNING label, version',
        ['Retry update', fieldId, userId, currentVersion]
      );
      expect(retry2.rowCount).toBe(1);
      expect(retry2.rows[0].label).toBe('Retry update');
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  }, 30000);
});
