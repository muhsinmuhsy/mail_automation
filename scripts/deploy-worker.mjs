import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
const stage = process.argv.includes('--stage');
const required = ['DATABASE_URL', 'SMTP_ENCRYPTION_KEY', 'B2_BUCKET_NAME', 'B2_REGION', 'B2_ENDPOINT', 'B2_KEY_ID', 'B2_APPLICATION_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing worker configuration: ${missing.join(', ')}`);

// Keep secrets out of command-line arguments, source control and CLI output.
const directory = resolve('.wrangler');
mkdirSync(directory, { recursive: true });
const secretsPath = resolve(directory, `deploy-secrets-${process.pid}.json`);
const configPath = resolve(directory, `deploy-config-${process.pid}.toml`);
try {
  writeFileSync(secretsPath, JSON.stringify(Object.fromEntries(required.map((key) => [key, process.env[key]]))), { mode: 0o600 });
  let config = readFileSync(resolve('wrangler.toml'), 'utf8');
  config = config.replace('main = "worker/index.ts"', `main = ${JSON.stringify(resolve('worker/index.ts').replaceAll('\\', '/'))}`);
  if (stage) {
    // Verify deployment without starting delivery of already-overdue campaigns.
    config = config.replace(/\[\[queues\.consumers\]\][\s\S]*?(?=\n\[|$)/g, '');
    config = config.replace('crons = ["* * * * *"]', 'crons = []');
  }
  writeFileSync(configPath, config);
  const result = spawnSync(process.execPath, [
    resolve(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js'), 'deploy', '--config', configPath,
    '--tsconfig', resolve('tsconfig.json'), '--secrets-file', secretsPath,
  ], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(secretsPath, { force: true });
  rmSync(configPath, { force: true });
}
