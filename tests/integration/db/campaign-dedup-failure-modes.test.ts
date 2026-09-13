import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { connectionString, setupSchema } from './helpers/dedup-test-setup';
import { Pool } from '@neondatabase/serverless';

describe.skipIf(!connectionString)('campaign deduplication — failure mode simulations (real PostgreSQL)', () => {

  it('lock timeout: second request waits when first holds the advisory lock', async () => {
    const pool = new Pool({ connectionString });
    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query('BEGIN');
      const schema = await setupSchema(clientA);

      const userId = randomUUID();
      await clientA.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, 'lock1@example.com']);
      await clientA.query('COMMIT');

      const lockKeyResult = await clientA.query(`SELECT hashtextextended('campaign-create:v1:${userId}', 42) as k`);
      const lockKey = (lockKeyResult.rows[0] as { k: string }).k;

      await clientA.query('BEGIN');
      await clientA.query(`SET LOCAL search_path TO "${schema}"`);
      await clientA.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

      const tryResult = await Promise.race([
        clientB.query('SELECT pg_try_advisory_lock($1) as acquired', [lockKey])
          .then(r => (r.rows[0] as { acquired: boolean }).acquired),
        new Promise<boolean>(resolve => setTimeout(() => resolve(true), 1000)),
      ]);
      expect(tryResult).toBe(false);

      await clientA.query('COMMIT');

      const afterCommit = await clientB.query('SELECT pg_try_advisory_lock($1) as acquired', [lockKey]);
      expect((afterCommit.rows[0] as { acquired: boolean }).acquired).toBe(true);
      await clientB.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    } finally {
      try { await clientA.query('ROLLBACK'); } catch { /* */ }
      clientA.release();
      clientB.release();
      await pool.end();
    }
  }, 30000);

  it('pool reconnection: new connection works after closing one', async () => {
    const pool = new Pool({ connectionString });
    const client1 = await pool.connect();
    try {
      await client1.query('SELECT 1 as ok');
      client1.release();

      const client2 = await pool.connect();
      const result = await client2.query('SELECT 1 as ok');
      expect(result.rows[0]).toEqual({ ok: 1 });
      client2.release();
    } finally {
      await pool.end();
    }
  }, 15000);

  it('connection acquisition failure: invalid connection string throws', async () => {
    await expect(
      (async () => {
        const badPool = new Pool({ connectionString: 'postgres://invalid:invalid@nonexistent.host:5432/invalid' });
        const client = await badPool.connect();
        client.release();
        await badPool.end();
      })()
    ).rejects.toThrow();
  }, 15000);

  it('transaction rollback releases advisory lock', async () => {
    const pool = new Pool({ connectionString });
    const clientA = await pool.connect();
    const clientB = await pool.connect();
    try {
      await clientA.query('BEGIN');

      const userId = randomUUID();
      const lockKeyResult = await clientA.query(`SELECT hashtextextended('campaign-create:v1:${userId}', 42) as k`);
      const lockKey = (lockKeyResult.rows[0] as { k: string }).k;

      await clientA.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
      await clientA.query('ROLLBACK');

      const acquired = await clientB.query('SELECT pg_try_advisory_lock($1) as acquired', [lockKey]);
      expect((acquired.rows[0] as { acquired: boolean }).acquired).toBe(true);
      await clientB.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    } finally {
      try { await clientA.query('ROLLBACK'); } catch { /* */ }
      clientA.release();
      clientB.release();
      await pool.end();
    }
  }, 30000);
});
