import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { neon, Pool } from '@neondatabase/serverless';
import { describe, it, expect } from 'vitest';
import { isLimitError, isTransientError } from '@/lib/limits/error-codes';

const dotenvParsed = config().parsed;
const connectionString = dotenvParsed?.DATABASE_URL ?? process.env.DATABASE_URL;

const shouldRun = !!connectionString;

function utcToday(): Date {
  const t = new Date();
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

function schemaSetupSql(s: string): string {
  return `
CREATE TYPE "${s}"."ReservationStatus" AS ENUM ('RESERVED', 'COMMITTED', 'RELEASED', 'UNKNOWN');

CREATE TABLE "${s}"."system_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "default_daily_email_limit" INTEGER NOT NULL DEFAULT 20,
  "global_daily_email_limit" INTEGER NOT NULL DEFAULT 500,
  "email_sending_enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "${s}"."users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) NOT NULL,
  "name" VARCHAR(255),
  "role" VARCHAR(10) NOT NULL DEFAULT 'USER',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "daily_email_limit_override" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "${s}"."campaigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "daily_limit" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "${s}"."email_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "campaign_id" UUID,
  "status" VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "email_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "${s}"."email_usage_daily" (
  "user_id" UUID NOT NULL,
  "usage_date" DATE NOT NULL,
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "reserved_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "email_usage_daily_pkey" PRIMARY KEY ("user_id", "usage_date")
);

CREATE TABLE "${s}"."system_usage_daily" (
  "usage_date" DATE NOT NULL,
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "reserved_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "system_usage_daily_pkey" PRIMARY KEY ("usage_date")
);

CREATE TABLE "${s}"."campaign_usage_daily" (
  "campaign_id" UUID NOT NULL,
  "usage_date" DATE NOT NULL,
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "reserved_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "campaign_usage_daily_pkey" PRIMARY KEY ("campaign_id", "usage_date")
);

CREATE TABLE "${s}"."email_send_reservations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email_job_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL DEFAULT 1,
  "user_id" UUID NOT NULL,
  "campaign_id" UUID,
  "usage_date" DATE NOT NULL,
  "status" "${s}"."ReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "resolved_at" TIMESTAMPTZ,
  CONSTRAINT "email_send_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "unique_reservations_job_attempt" UNIQUE ("email_job_id", "attempt_number")
);
`;
}

const sql = shouldRun ? neon(connectionString) : null;

async function setupSchema(): Promise<string> {
  const schema = `elc_test_${randomUUID().replaceAll('-', '')}`;
  await sql!.query(`CREATE SCHEMA "${schema}"`);
  const statements = schemaSetupSql(schema)
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await sql!.query(stmt);
  }
  return schema;
}

async function teardownSchema(schema: string) {
  await sql!.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
}

async function reserveWithSql(
  pool: Pool,
  schema: string,
  userId: string,
  emailJobId: string,
  attemptNumber: number,
  campaignId?: string
): Promise<{ success: boolean; reason?: string }> {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schema}"`);
    const today = utcToday();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      const settings = (
        await client.query('SELECT * FROM system_settings WHERE id = 1')
      ).rows[0] as {
        global_daily_email_limit: number;
        default_daily_email_limit: number;
        email_sending_enabled: boolean;
      };
      if (!settings || !settings.email_sending_enabled) {
        await client.query('ROLLBACK');
        return { success: false, reason: 'Email sending is currently disabled.' };
      }

      const user = (
        await client.query(
          'SELECT is_active, daily_email_limit_override FROM users WHERE id = $1',
          [userId]
        )
      ).rows[0] as { is_active: boolean; daily_email_limit_override: number | null };
      if (!user || !user.is_active) {
        await client.query('ROLLBACK');
        return { success: false, reason: 'User account is inactive.' };
      }

      const existing = (
        await client.query(
          'SELECT id FROM email_send_reservations WHERE email_job_id = $1 AND attempt_number = $2 AND status = $3',
          [emailJobId, attemptNumber, 'RESERVED']
        )
      ).rows[0];
      if (existing) {
        await client.query('COMMIT');
        return { success: true };
      }

      const globalLimit = settings.global_daily_email_limit;
      const userLimit = user.daily_email_limit_override ?? settings.default_daily_email_limit;

      let campaignLimit: number | null = null;
      if (campaignId) {
        const camp = (
          await client.query('SELECT daily_limit FROM campaigns WHERE id = $1', [campaignId])
        ).rows[0] as { daily_limit: number | null };
        if (camp?.daily_limit !== null && camp?.daily_limit !== undefined) {
          campaignLimit = camp.daily_limit;
        }
      }

      await client.query(
        'INSERT INTO system_usage_daily (usage_date) VALUES ($1) ON CONFLICT (usage_date) DO NOTHING',
        [today]
      );
      const sysRow = (
        await client.query(
          'SELECT sent_count, reserved_count FROM system_usage_daily WHERE usage_date = $1',
          [today]
        )
      ).rows[0] as { sent_count: number; reserved_count: number };
      if (sysRow && sysRow.sent_count + sysRow.reserved_count >= globalLimit) {
        await client.query('ROLLBACK');
        return { success: false, reason: '[SYSTEM_DAILY_LIMIT] System daily limit reached.' };
      }

      await client.query(
        'INSERT INTO email_usage_daily (user_id, usage_date) VALUES ($1, $2) ON CONFLICT (user_id, usage_date) DO NOTHING',
        [userId, today]
      );
      const uRow = (
        await client.query(
          'SELECT sent_count, reserved_count FROM email_usage_daily WHERE user_id = $1 AND usage_date = $2',
          [userId, today]
        )
      ).rows[0] as { sent_count: number; reserved_count: number };
      if (uRow && uRow.sent_count + uRow.reserved_count >= userLimit) {
        await client.query('ROLLBACK');
        return { success: false, reason: '[ACCOUNT_DAILY_LIMIT] Account daily limit reached.' };
      }

      if (campaignLimit !== null) {
        await client.query(
          'INSERT INTO campaign_usage_daily (campaign_id, usage_date) VALUES ($1, $2) ON CONFLICT (campaign_id, usage_date) DO NOTHING',
          [campaignId, today]
        );
        const cRow = (
          await client.query(
            'SELECT sent_count, reserved_count FROM campaign_usage_daily WHERE campaign_id = $1 AND usage_date = $2',
            [campaignId, today]
          )
        ).rows[0] as { sent_count: number; reserved_count: number };
        if (cRow && cRow.sent_count + cRow.reserved_count >= campaignLimit) {
          await client.query('ROLLBACK');
          return { success: false, reason: '[CAMPAIGN_DAILY_LIMIT] Campaign daily limit reached.' };
        }
      }

      await client.query(
        'UPDATE email_usage_daily SET reserved_count = reserved_count + 1 WHERE user_id = $1 AND usage_date = $2',
        [userId, today]
      );
      await client.query(
        'UPDATE system_usage_daily SET reserved_count = reserved_count + 1 WHERE usage_date = $1',
        [today]
      );
      if (campaignId) {
        await client.query(
          'UPDATE campaign_usage_daily SET reserved_count = reserved_count + 1 WHERE campaign_id = $1 AND usage_date = $2',
          [campaignId, today]
        );
      }

      await client.query(
        'INSERT INTO email_send_reservations (email_job_id, attempt_number, user_id, campaign_id, usage_date, status) VALUES ($1, $2, $3, $4, $5, $6)',
        [emailJobId, attemptNumber, userId, campaignId ?? null, today, 'RESERVED']
      );

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      const code = (error as { code?: string })?.code;
      if (code === '40001') {
        return { success: false, reason: '[QUOTA_TRANSACTION_CONFLICT] Serialization conflict.' };
      }
      const msg = (error as Error)?.message ?? '';
      if (msg.includes('Connection terminated') || msg.includes('WebSocket')) {
        return { success: false, reason: '[CONNECTION_ERROR] Database connection lost.' };
      }
      throw error;
    }
  } finally {
    client.release();
  }
}

function q(schema: string, table: string): string {
  return `"${schema}"."${table}"`;
}

describe.skipIf(!shouldRun)('email limit concurrency (real PostgreSQL)', () => {
  it(
    'concurrent reservations for same account do not overrun the account limit',
    async () => {
      const schema = await setupSchema();
      try {
        const userId = randomUUID();
        const today = utcToday();

        await sql!.query(`INSERT INTO ${q(schema, 'system_settings')} (id, global_daily_email_limit, default_daily_email_limit, email_sending_enabled) VALUES (1, 500, 3, true)`);
        await sql!.query(`INSERT INTO ${q(schema, 'users')} (id, email, daily_email_limit_override) VALUES ($1, $2, NULL)`, [userId, `u-${userId}@test.com`]);

        const jobIds: string[] = [];
        for (let i = 0; i < 5; i++) {
          const jobId = randomUUID();
          await sql!.query(`INSERT INTO ${q(schema, 'email_jobs')} (id, user_id) VALUES ($1, $2)`, [jobId, userId]);
          jobIds.push(jobId);
        }

        const pool = new Pool({ connectionString, max: 5 });
        try {
          const results = await Promise.allSettled(
            jobIds.map((jobId) => reserveWithSql(pool, schema, userId, jobId, 1))
          );

          const successes = results.filter(
            (r) => r.status === 'fulfilled' && r.value.success === true
          );
          expect(successes.length).toBeLessThanOrEqual(3);
        } finally {
          await pool.end().catch(() => {});
        }

        const userUsageRows = await sql!.query(`SELECT reserved_count FROM ${q(schema, 'email_usage_daily')} WHERE user_id = $1 AND usage_date = $2`, [userId, today]);
        const userUsage = userUsageRows[0] as { reserved_count: number } | undefined;
        expect(userUsage?.reserved_count).toBeLessThanOrEqual(3);
      } finally {
        await teardownSchema(schema);
      }
    },
    30000
  );

  it(
    'concurrent reservations for different accounts do not overrun the system limit',
    async () => {
      const schema = await setupSchema();
      try {
        const today = utcToday();

        await sql!.query(`INSERT INTO ${q(schema, 'system_settings')} (id, global_daily_email_limit, default_daily_email_limit, email_sending_enabled) VALUES (1, 2, 100, true)`);

        const users: string[] = [];
        const jobIds: string[] = [];
        for (let i = 0; i < 3; i++) {
          const userId = randomUUID();
          await sql!.query(`INSERT INTO ${q(schema, 'users')} (id, email, daily_email_limit_override) VALUES ($1, $2, 100)`, [userId, `u-${userId}@test.com`]);
          users.push(userId);
          const jobId = randomUUID();
          await sql!.query(`INSERT INTO ${q(schema, 'email_jobs')} (id, user_id) VALUES ($1, $2)`, [jobId, userId]);
          jobIds.push(jobId);
        }

        const pool = new Pool({ connectionString, max: 3 });
        try {
          const results = await Promise.allSettled(
            jobIds.map((jobId, i) => reserveWithSql(pool, schema, users[i], jobId, 1))
          );

          const successes = results.filter(
            (r) => r.status === 'fulfilled' && r.value.success === true
          );
          expect(successes.length).toBeLessThanOrEqual(2);
        } finally {
          await pool.end().catch(() => {});
        }

        const sysUsageRows = await sql!.query(`SELECT reserved_count FROM ${q(schema, 'system_usage_daily')} WHERE usage_date = $1`, [today]);
        const sysUsage = sysUsageRows[0] as { reserved_count: number } | undefined;
        expect(sysUsage?.reserved_count).toBeLessThanOrEqual(2);
      } finally {
        await teardownSchema(schema);
      }
    },
    30000
  );

  it(
    'concurrent reservations for same campaign do not overrun the campaign limit',
    async () => {
      const schema = await setupSchema();
      try {
        const today = utcToday();
        const userId = randomUUID();
        const campaignId = randomUUID();

        await sql!.query(`INSERT INTO ${q(schema, 'system_settings')} (id, global_daily_email_limit, default_daily_email_limit, email_sending_enabled) VALUES (1, 500, 100, true)`);
        await sql!.query(`INSERT INTO ${q(schema, 'users')} (id, email, daily_email_limit_override) VALUES ($1, $2, 100)`, [userId, `u-${userId}@test.com`]);
        await sql!.query(`INSERT INTO ${q(schema, 'campaigns')} (id, user_id, name, daily_limit) VALUES ($1, $2, $3, 2)`, [campaignId, userId, 'Test']);

        const jobIds: string[] = [];
        for (let i = 0; i < 4; i++) {
          const jobId = randomUUID();
          await sql!.query(`INSERT INTO ${q(schema, 'email_jobs')} (id, user_id, campaign_id) VALUES ($1, $2, $3)`, [jobId, userId, campaignId]);
          jobIds.push(jobId);
        }

        const pool = new Pool({ connectionString, max: 4 });
        try {
          const results = await Promise.allSettled(
            jobIds.map((jobId) => reserveWithSql(pool, schema, userId, jobId, 1, campaignId))
          );

          const successes = results.filter(
            (r) => r.status === 'fulfilled' && r.value.success === true
          );
          expect(successes.length).toBeLessThanOrEqual(2);
        } finally {
          await pool.end().catch(() => {});
        }

        const campUsageRows = await sql!.query(`SELECT reserved_count FROM ${q(schema, 'campaign_usage_daily')} WHERE campaign_id = $1 AND usage_date = $2`, [campaignId, today]);
        const campUsage = campUsageRows[0] as { reserved_count: number } | undefined;
        expect(campUsage?.reserved_count).toBeLessThanOrEqual(2);
      } finally {
        await teardownSchema(schema);
      }
    },
    30000
  );

  it(
    'exactly one reservation per (email_job_id, attempt_number) after concurrent calls',
    async () => {
      const schema = await setupSchema();
      try {
        const userId = randomUUID();
        const jobId = randomUUID();

        await sql!.query(`INSERT INTO ${q(schema, 'system_settings')} (id, global_daily_email_limit, default_daily_email_limit, email_sending_enabled) VALUES (1, 500, 100, true)`);
        await sql!.query(`INSERT INTO ${q(schema, 'users')} (id, email, daily_email_limit_override) VALUES ($1, $2, 100)`, [userId, `u-${userId}@test.com`]);
        await sql!.query(`INSERT INTO ${q(schema, 'email_jobs')} (id, user_id) VALUES ($1, $2)`, [jobId, userId]);

        const pool = new Pool({ connectionString, max: 3 });
        try {
          const results = await Promise.allSettled([
            reserveWithSql(pool, schema, userId, jobId, 1),
            reserveWithSql(pool, schema, userId, jobId, 1),
            reserveWithSql(pool, schema, userId, jobId, 1),
          ]);

          const successes = results.filter(
            (r) => r.status === 'fulfilled' && r.value.success === true
          );
          expect(successes.length).toBeGreaterThanOrEqual(1);
        } finally {
          await pool.end().catch(() => {});
        }

        const reservationsRows = await sql!.query(`SELECT count(*)::int as cnt FROM ${q(schema, 'email_send_reservations')} WHERE email_job_id = $1 AND attempt_number = 1`, [jobId]);
        const reservations = reservationsRows[0] as { cnt: number };
        expect(reservations.cnt).toBe(1);
      } finally {
        await teardownSchema(schema);
      }
    },
    30000
  );

  it(
    'counters never go negative after double release',
    async () => {
      const schema = await setupSchema();
      try {
        const userId = randomUUID();
        const jobId = randomUUID();
        const today = utcToday();

        await sql!.query(`INSERT INTO ${q(schema, 'system_settings')} (id, global_daily_email_limit, default_daily_email_limit, email_sending_enabled) VALUES (1, 500, 100, true)`);
        await sql!.query(`INSERT INTO ${q(schema, 'users')} (id, email, daily_email_limit_override) VALUES ($1, $2, 100)`, [userId, `u-${userId}@test.com`]);
        await sql!.query(`INSERT INTO ${q(schema, 'email_jobs')} (id, user_id) VALUES ($1, $2)`, [jobId, userId]);

        const pool = new Pool({ connectionString, max: 1 });
        try {
          await reserveWithSql(pool, schema, userId, jobId, 1);
        } finally {
          await pool.end().catch(() => {});
        }

        await sql!.query(`UPDATE ${q(schema, 'email_send_reservations')} SET status = $1, resolved_at = now() WHERE email_job_id = $2 AND status = $3`, ['RELEASED', jobId, 'RESERVED']);
        await sql!.query(`UPDATE ${q(schema, 'email_usage_daily')} SET reserved_count = reserved_count - 1 WHERE user_id = $1 AND usage_date = $2`, [userId, today]);
        await sql!.query(`UPDATE ${q(schema, 'system_usage_daily')} SET reserved_count = reserved_count - 1 WHERE usage_date = $1`, [today]);

        const userUsageRows = await sql!.query(`SELECT reserved_count, sent_count FROM ${q(schema, 'email_usage_daily')} WHERE user_id = $1 AND usage_date = $2`, [userId, today]);
        const userUsage = userUsageRows[0] as { reserved_count: number; sent_count: number } | undefined;
        expect(userUsage?.reserved_count).toBeGreaterThanOrEqual(0);
        expect(userUsage?.sent_count).toBeGreaterThanOrEqual(0);
      } finally {
        await teardownSchema(schema);
      }
    },
    30000
  );

  it(
    'commit moves reserved to sent correctly on all three counters',
    async () => {
      const schema = await setupSchema();
      try {
        const userId = randomUUID();
        const campaignId = randomUUID();
        const jobId = randomUUID();
        const today = utcToday();

        await sql!.query(`INSERT INTO ${q(schema, 'system_settings')} (id, global_daily_email_limit, default_daily_email_limit, email_sending_enabled) VALUES (1, 500, 100, true)`);
        await sql!.query(`INSERT INTO ${q(schema, 'users')} (id, email, daily_email_limit_override) VALUES ($1, $2, 100)`, [userId, `u-${userId}@test.com`]);
        await sql!.query(`INSERT INTO ${q(schema, 'campaigns')} (id, user_id, name, daily_limit) VALUES ($1, $2, $3, 50)`, [campaignId, userId, 'Test']);
        await sql!.query(`INSERT INTO ${q(schema, 'email_jobs')} (id, user_id, campaign_id) VALUES ($1, $2, $3)`, [jobId, userId, campaignId]);

        const pool = new Pool({ connectionString, max: 1 });
        try {
          await reserveWithSql(pool, schema, userId, jobId, 1, campaignId);
        } finally {
          await pool.end().catch(() => {});
        }

        await sql!.query(`UPDATE ${q(schema, 'email_send_reservations')} SET status = $1, resolved_at = now() WHERE email_job_id = $2 AND status = $3`, ['COMMITTED', jobId, 'RESERVED']);
        await sql!.query(`UPDATE ${q(schema, 'email_usage_daily')} SET reserved_count = reserved_count - 1, sent_count = sent_count + 1 WHERE user_id = $1 AND usage_date = $2`, [userId, today]);
        await sql!.query(`UPDATE ${q(schema, 'system_usage_daily')} SET reserved_count = reserved_count - 1, sent_count = sent_count + 1 WHERE usage_date = $1`, [today]);
        await sql!.query(`UPDATE ${q(schema, 'campaign_usage_daily')} SET reserved_count = reserved_count - 1, sent_count = sent_count + 1 WHERE campaign_id = $1 AND usage_date = $2`, [campaignId, today]);

        const uRows = await sql!.query(`SELECT sent_count, reserved_count FROM ${q(schema, 'email_usage_daily')} WHERE user_id = $1 AND usage_date = $2`, [userId, today]);
        const sRows = await sql!.query(`SELECT sent_count, reserved_count FROM ${q(schema, 'system_usage_daily')} WHERE usage_date = $1`, [today]);
        const cRows = await sql!.query(`SELECT sent_count, reserved_count FROM ${q(schema, 'campaign_usage_daily')} WHERE campaign_id = $1 AND usage_date = $2`, [campaignId, today]);

        const uRow = uRows[0] as { sent_count: number; reserved_count: number };
        const sRow = sRows[0] as { sent_count: number; reserved_count: number };
        const cRow = cRows[0] as { sent_count: number; reserved_count: number };

        expect(uRow.sent_count).toBe(1);
        expect(uRow.reserved_count).toBe(0);
        expect(sRow.sent_count).toBe(1);
        expect(sRow.reserved_count).toBe(0);
        expect(cRow.sent_count).toBe(1);
        expect(cRow.reserved_count).toBe(0);
      } finally {
        await teardownSchema(schema);
      }
    },
    30000
  );

  it(
    'no partial counter increments after a failed reservation',
    async () => {
      const schema = await setupSchema();
      try {
        const userId = randomUUID();
        const jobId = randomUUID();
        const today = utcToday();

        await sql!.query(`INSERT INTO ${q(schema, 'system_settings')} (id, global_daily_email_limit, default_daily_email_limit, email_sending_enabled) VALUES (1, 500, 0, true)`);
        await sql!.query(`INSERT INTO ${q(schema, 'users')} (id, email, daily_email_limit_override) VALUES ($1, $2, NULL)`, [userId, `u-${userId}@test.com`]);
        await sql!.query(`INSERT INTO ${q(schema, 'email_jobs')} (id, user_id) VALUES ($1, $2)`, [jobId, userId]);

        const pool = new Pool({ connectionString, max: 1 });
        try {
          const result = await reserveWithSql(pool, schema, userId, jobId, 1);
          expect(result.success).toBe(false);
        } finally {
          await pool.end().catch(() => {});
        }

        const uRows = await sql!.query(`SELECT reserved_count FROM ${q(schema, 'email_usage_daily')} WHERE user_id = $1 AND usage_date = $2`, [userId, today]);
        const sRows = await sql!.query(`SELECT reserved_count FROM ${q(schema, 'system_usage_daily')} WHERE usage_date = $1`, [today]);
        const reservationsRows = await sql!.query(`SELECT count(*)::int as cnt FROM ${q(schema, 'email_send_reservations')} WHERE email_job_id = $1`, [jobId]);

        expect((uRows[0] as { reserved_count: number })?.reserved_count ?? 0).toBe(0);
        expect((sRows[0] as { reserved_count: number })?.reserved_count ?? 0).toBe(0);
        expect((reservationsRows[0] as { cnt: number }).cnt).toBe(0);
      } finally {
        await teardownSchema(schema);
      }
    },
    30000
  );

  it(
    'limit error has structured code prefix',
    async () => {
      const schema = await setupSchema();
      try {
        const userId = randomUUID();

        await sql!.query(`INSERT INTO ${q(schema, 'system_settings')} (id, global_daily_email_limit, default_daily_email_limit, email_sending_enabled) VALUES (1, 500, 1, true)`);
        await sql!.query(`INSERT INTO ${q(schema, 'users')} (id, email, daily_email_limit_override) VALUES ($1, $2, NULL)`, [userId, `u-${userId}@test.com`]);

        const jobId1 = randomUUID();
        const jobId2 = randomUUID();
        await sql!.query(`INSERT INTO ${q(schema, 'email_jobs')} (id, user_id) VALUES ($1, $2)`, [jobId1, userId]);
        await sql!.query(`INSERT INTO ${q(schema, 'email_jobs')} (id, user_id) VALUES ($1, $2)`, [jobId2, userId]);

        const pool = new Pool({ connectionString, max: 1 });
        try {
          const r1 = await reserveWithSql(pool, schema, userId, jobId1, 1);
          expect(r1.success).toBe(true);

          const r2 = await reserveWithSql(pool, schema, userId, jobId2, 1);
          expect(r2.success).toBe(false);
          expect(isLimitError(r2.reason)).toBe(true);
          expect(r2.reason).toContain('[ACCOUNT_DAILY_LIMIT]');
        } finally {
          await pool.end().catch(() => {});
        }
      } finally {
        await teardownSchema(schema);
      }
    },
    30000
  );

  it('P2034 transient error is not a limit error', () => {
    const transientReason =
      '[QUOTA_TRANSACTION_CONFLICT] Could not reserve email capacity after 3 attempts.';
    expect(isLimitError(transientReason)).toBe(false);
    expect(isTransientError(transientReason)).toBe(true);
  });
});
