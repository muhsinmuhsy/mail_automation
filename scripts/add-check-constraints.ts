import { config } from 'dotenv';
import { Pool } from '@neondatabase/serverless';

const dotenvParsed = config().parsed;
const connectionString = dotenvParsed?.DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString });

const constraints: [string, string, string][] = [
  ['campaigns', 'campaigns_interval_minutes_check', 'CHECK ("interval_minutes" > 0)'],
  ['campaigns', 'campaigns_daily_limit_check', 'CHECK ("daily_limit" IS NULL OR "daily_limit" > 0)'],
  ['email_usage_daily', 'email_usage_daily_sent_count_check', 'CHECK ("sent_count" >= 0)'],
  ['email_usage_daily', 'email_usage_daily_reserved_count_check', 'CHECK ("reserved_count" >= 0)'],
  ['campaign_usage_daily', 'campaign_usage_daily_sent_count_check', 'CHECK ("sent_count" >= 0)'],
  ['campaign_usage_daily', 'campaign_usage_daily_reserved_count_check', 'CHECK ("reserved_count" >= 0)'],
  ['system_usage_daily', 'system_usage_daily_sent_count_check', 'CHECK ("sent_count" >= 0)'],
  ['system_usage_daily', 'system_usage_daily_reserved_count_check', 'CHECK ("reserved_count" >= 0)'],
  ['email_jobs', 'email_jobs_creation_key_valid', 'CHECK (creation_key IS NULL OR (campaign_id IS NOT NULL AND creation_key = campaign_id::text || \':\' || lower(btrim(to_email))))'],
];

async function main() {
  for (const [table, name, def] of constraints) {
    try {
      await pool.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${name}"`);
      await pool.query(`ALTER TABLE "${table}" ADD CONSTRAINT "${name}" ${def}`);
      console.log('OK:', name);
    } catch (err) {
      console.error('FAIL:', name, '-', (err as Error).message);
    }
  }
  await pool.end();
}

main();
