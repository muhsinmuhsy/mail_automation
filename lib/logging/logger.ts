/**
 * Structured logger with secret redaction.
 *
 * Logs are emitted as a single JSON object per line (when not in a browser)
 * so they can be ingested by log aggregation systems. Any value whose key
 * matches a known-secret pattern is replaced with `[REDACTED]`.
 */

const SECRET_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /application[_-]?key/i,
  /cookie/i,
  /authorization/i,
  /refresh/i,
  /private[_-]?key/i,
  /session/i,
];

const REDACTED = '[REDACTED]';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL as LogLevel | undefined;
  if (fromEnv && fromEnv in LEVEL_PRIORITY) {
    return fromEnv;
  }
  return 'info';
}

function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some((re) => re.test(key));
}

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (seen.has(value as object)) {
    return '[Circular]';
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSecretKey(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = redact(v, seen);
    }
  }
  return out;
}

function emit(level: LogLevel, message: string, meta?: unknown) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel()]) {
    return;
  }

  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...(meta !== undefined ? { meta: redact(meta) } : {}),
  };

  const line = JSON.stringify(entry);

  if (typeof process === 'undefined' || !process.stdout) {
    return;
  }

  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug(message: string, meta?: unknown) {
    emit('debug', message, meta);
  },
  info(message: string, meta?: unknown) {
    emit('info', message, meta);
  },
  warn(message: string, meta?: unknown) {
    emit('warn', message, meta);
  },
  error(message: string, meta?: unknown) {
    emit('error', message, meta);
  },
};
