import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Pool } from '@neondatabase/serverless';

const root = process.cwd();
const envPath = resolve(root, '.env');
const mode = process.argv.includes('--local') ? 'local' : 'production';

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname);
  } catch {
    return false;
  }
}

function requireValue(name, errors) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    errors.push(`${name} is required.`);
    return '';
  }
  return value.trim();
}

function validateUrl(name, errors) {
  const value = requireValue(name, errors);
  if (!value) return;
  try {
    new URL(value);
  } catch {
    errors.push(`${name} must be a valid URL.`);
  }
}

async function checkB2(errors) {
  const priorErrors = errors.length;
  const bucket = requireValue('B2_BUCKET_NAME', errors);
  const endpoint = requireValue('B2_ENDPOINT', errors);
  const region = requireValue('B2_REGION', errors);
  const accessKeyId = requireValue('B2_KEY_ID', errors);
  const secretAccessKey = requireValue('B2_APPLICATION_KEY', errors);
  if (errors.length > priorErrors) return;

  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  const key = `readiness/${crypto.randomUUID()}.txt`;
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new TextEncoder().encode('ok'),
      ContentType: 'text/plain',
    }));
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) {
      errors.push('B2 read check failed: object response did not include a body.');
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const status = error?.$metadata?.httpStatusCode;
    errors.push(`B2 live write/read check failed (${name}${status ? `, HTTP ${status}` : ''}). Check B2_KEY_ID, B2_APPLICATION_KEY, bucket, region, endpoint, and read/write scope.`);
  } finally {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      if (errors.length === 0) {
        errors.push('B2 cleanup check failed. Verify the application key has delete permissions.');
      }
    }
    client.destroy();
  }
}

async function main() {
  createRequire(import.meta.url)('@next/env').loadEnvConfig(root, false);
  loadDotEnv(envPath);

  const errors = [];
  const warnings = [];

  requireValue('DATABASE_URL', errors);
  validateUrl('NEON_AUTH_BASE_URL', errors);
  const cookieSecret = requireValue('NEON_AUTH_COOKIE_SECRET', errors);
  if (cookieSecret && cookieSecret.length < 32) {
    errors.push('NEON_AUTH_COOKIE_SECRET must be at least 32 characters.');
  }

  const appUrl = requireValue('NEXT_PUBLIC_APP_URL', errors);
  if (appUrl) {
    validateUrl('NEXT_PUBLIC_APP_URL', errors);
    if (mode === 'production' && isLocalUrl(appUrl)) {
      errors.push('NEXT_PUBLIC_APP_URL points to localhost; set it to the deployed HTTPS origin before production.');
    }
  }

  requireValue('GOOGLE_CLIENT_ID', errors);
  requireValue('GOOGLE_CLIENT_SECRET', errors);
  const redirect = requireValue('GOOGLE_REDIRECT_URI', errors);
  if (redirect) {
    try {
      const url = new URL(redirect);
      if (url.origin !== new URL(appUrl).origin || url.pathname !== '/api/email-accounts/callback/gmail' || url.search || url.hash || url.username || url.password) errors.push('GOOGLE_REDIRECT_URI must match the app origin and /api/email-accounts/callback/gmail exactly.');
      if (url.protocol !== 'https:' && !(mode === 'local' && url.protocol === 'http:' && isLocalUrl(redirect))) errors.push('Google redirect URI must use HTTPS (HTTP localhost is allowed for local checks).');
    } catch { errors.push('GOOGLE_REDIRECT_URI must be a valid URL.'); }
  }

  const smtpKey = requireValue('SMTP_ENCRYPTION_KEY', errors);
  if (smtpKey && !/^[a-f0-9]{64}$/i.test(smtpKey)) {
    errors.push('SMTP_ENCRYPTION_KEY must be a 64-character hex string.');
  }

  await checkB2(errors);

  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
    try {
      const result = await pool.query(`SELECT to_regclass('public.email_oauth_attempts') AS attempts,
        (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_accounts'
          AND column_name IN ('provider_account_id', 'granted_scopes', 'connection_error')) AS columns`);
      if (!result.rows[0]?.attempts || result.rows[0]?.columns !== 3) errors.push('Gmail OAuth database migration is pending. Run npx prisma migrate deploy before starting the updated app and worker.');
    } catch { errors.push('Database readiness check failed. Check database access and apply migrations.'); }
    finally { await pool.end(); }
  }

  for (const warning of warnings) {
    console.warn(`WARN ${warning}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`${mode === 'local' ? 'Local production' : 'Production'} configuration and storage checks passed. Google consent/verification and a real authorized Gmail send must be checked separately.`);
}

await main();
