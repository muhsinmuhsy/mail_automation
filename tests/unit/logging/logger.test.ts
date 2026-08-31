import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, redact } from '@/lib/logging/logger';

function captureWrites() {
  const lines: string[] = [];
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((c: string | Uint8Array) => {
    lines.push(c.toString());
    return true;
  });
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((c: string | Uint8Array) => {
    lines.push(c.toString());
    return true;
  });
  return { lines, stdout, stderr };
}

describe('lib/logging/logger', () => {
  let cap: ReturnType<typeof captureWrites>;

  beforeEach(() => {
    cap = captureWrites();
    vi.stubEnv('LOG_LEVEL', 'debug');
  });

  afterEach(() => {
    cap.stdout.mockRestore();
    cap.stderr.mockRestore();
    vi.unstubAllEnvs();
  });

  it('emits info, warn, error and debug with the expected shape', () => {
    logger.info('hello', { a: 1 });
    logger.warn('careful');
    logger.debug('trace');
    logger.error('boom', { b: 2 });

    const written = cap.lines.map((l) => JSON.parse(l));
    const info = written.find((w) => w.level === 'info');
    expect(info.message).toBe('hello');
    expect(info.meta).toEqual({ a: 1 });
    expect(typeof info.time).toBe('string');

    expect(written.some((w) => w.level === 'warn' && w.message === 'careful')).toBe(true);
    expect(written.some((w) => w.level === 'debug' && w.message === 'trace')).toBe(true);
    expect(written.some((w) => w.level === 'error' && w.message === 'boom')).toBe(true);
  });

  it('writes error-level logs to stderr and others to stdout', () => {
    logger.info('to-stdout');
    logger.error('to-stderr');
    expect(cap.stdout.mock.calls.some((c) => c[0].toString().includes('to-stdout'))).toBe(true);
    expect(cap.stderr.mock.calls.some((c) => c[0].toString().includes('to-stderr'))).toBe(true);
  });

  it('redacts secret keys recursively', () => {
    logger.info('secrets', {
      password: 'hunter2',
      apiKey: 'sk-123',
      nested: { token: 'abc', safe: 'ok' },
    });
    const line = JSON.parse(cap.lines[0]);
    expect(line.meta.password).toBe('[REDACTED]');
    expect(line.meta.apiKey).toBe('[REDACTED]');
    expect(line.meta.nested.token).toBe('[REDACTED]');
    expect(line.meta.nested.safe).toBe('ok');
  });

  it('redacts Error values but preserves name/message/stack', () => {
    logger.error('errored', { cause: new Error('kaboom') });
    const line = JSON.parse(cap.lines[0]);
    expect(line.meta.cause).toEqual({ name: 'Error', message: 'kaboom', stack: expect.any(String) });
  });

  it('does not throw on circular references', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => logger.info('circular', circular)).not.toThrow();
    const line = JSON.parse(cap.lines[0]);
    expect(line.meta.self).toBe('[Circular]');
  });

  it('does not throw on very large payloads', () => {
    const big = { items: Array.from({ length: 5000 }, (_, i) => ({ id: i, blob: 'x'.repeat(50) })) };
    expect(() => logger.info('big', big)).not.toThrow();
    expect(cap.lines.length).toBe(1);
  });

  it('suppresses levels below the configured LOG_LEVEL', () => {
    vi.stubEnv('LOG_LEVEL', 'error');
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    const written = cap.lines.map((l) => JSON.parse(l));
    expect(written.every((w) => w.level === 'error')).toBe(true);
    expect(written).toHaveLength(1);
  });
});

describe('lib/logging/logger.redact', () => {
  it('returns primitives and null/undefined untouched', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
    expect(redact('plain')).toBe('plain');
    expect(redact(42)).toBe(42);
  });

  it('redacts top-level secret keys', () => {
    expect(redact({ secret: 'x', cookie: 'y', session: 'z' })).toEqual({
      secret: '[REDACTED]',
      cookie: '[REDACTED]',
      session: '[REDACTED]',
    });
  });
});
