import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), false);
const index = process.argv.indexOf('--account');
const account = index >= 0 ? process.argv[index + 1] : '';
if (!account || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)) {
  throw new Error('Specify the connected Gmail address: npm run test:gmail:live -- --account you@gmail.com');
}
const required = ['DATABASE_URL', 'SMTP_ENCRYPTION_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'NEXT_PUBLIC_APP_URL'];
const missing = required.filter(name => !process.env[name]);
if (missing.length) throw new Error(`Missing local production settings: ${missing.join(', ')}`);

// Deliberately run only opt-in integration tests with real credentials. Never
// expose secrets in arguments or run unrelated test fixtures against live data.
const result = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run', 'tests/integration/gmail/live.test.ts', '--maxWorkers=1',
], { stdio: 'inherit', env: { ...process.env, GMAIL_LIVE_TEST_ACCOUNT: account.toLowerCase() } });
process.exitCode = result.status ?? 1;
