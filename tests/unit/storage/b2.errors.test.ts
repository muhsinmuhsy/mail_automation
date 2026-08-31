import { describe, it, expect } from 'vitest';
import { mapB2Error, StorageError } from '@/lib/storage/b2/b2.errors';

function s3Error(name: string, status?: number): Error {
  const e = new Error(name) as Error & { name: string; $metadata: { httpStatusCode?: number } };
  e.name = name;
  e.$metadata = { httpStatusCode: status };
  return e;
}

describe('lib/storage/b2/b2.errors', () => {
  it('StorageError carries code, message and cause', () => {
    const cause = new Error('root');
    const e = new StorageError('NOT_FOUND', 'missing', cause);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('StorageError');
    expect(e.code).toBe('NOT_FOUND');
    expect(e.message).toBe('missing');
    expect(e.cause).toBe(cause);
  });

  it('returns the same StorageError instance unchanged', () => {
    const e = new StorageError('UNKNOWN', 'm');
    expect(mapB2Error(e)).toBe(e);
  });

  it('maps timeout-like errors to TIMEOUT with context', () => {
    const cases: unknown[] = [
      Object.assign(new Error('t'), { name: 'TimeoutError' }),
      Object.assign(new Error('a'), { name: 'AbortError' }),
      new Error('connection timed out'),
      new Error('operation timed out'),
      Object.assign(new Error('r'), { code: 'ECONNRESET' }),
      Object.assign(new Error('r'), { code: 'ECONNREFUSED' }),
    ];
    for (const err of cases) {
      const m = mapB2Error(err, 'upload:x');
      expect(m.code).toBe('TIMEOUT');
      expect(m.message).toContain('upload:x');
    }
  });

  it('maps a NoSuchKey Error to NOT_FOUND', () => {
    const e = Object.assign(new Error('x'), { name: 'NoSuchKey' });
    expect(mapB2Error(e, 'ctx').code).toBe('NOT_FOUND');
  });

  it('maps S3 404 / NotFound / NoSuchKey to NOT_FOUND', () => {
    expect(mapB2Error(s3Error('NoSuchKey', 404)).code).toBe('NOT_FOUND');
    expect(mapB2Error(s3Error('NotFound', 404)).code).toBe('NOT_FOUND');
    expect(mapB2Error(s3Error('NoSuchKey', 500)).code).toBe('NOT_FOUND');
    expect(mapB2Error(s3Error('NotFound', 500)).code).toBe('NOT_FOUND');
  });

  it('maps S3 403 / 400 / AccessDenied to FORBIDDEN', () => {
    expect(mapB2Error(s3Error('AccessDenied', 403)).code).toBe('FORBIDDEN');
    expect(mapB2Error(s3Error('AccessDenied', 400)).code).toBe('FORBIDDEN');
    expect(mapB2Error(s3Error('SomeError', 403)).code).toBe('FORBIDDEN');
    expect(mapB2Error(s3Error('SomeError', 400)).code).toBe('FORBIDDEN');
  });

  it('maps other S3 errors to UNKNOWN with context', () => {
    const m = mapB2Error(s3Error('InternalError', 500), 'getMetadata:k');
    expect(m.code).toBe('UNKNOWN');
    expect(m.message).toContain('InternalError');
    expect(m.message).toContain('getMetadata:k');
  });

  it('maps non-Error scalars to UNKNOWN', () => {
    expect(mapB2Error('a string').code).toBe('UNKNOWN');
    expect(mapB2Error(null).code).toBe('UNKNOWN');
  });

  it('maps unknown objects without S3 shape to UNKNOWN', () => {
    expect(mapB2Error({ foo: 'bar' }).code).toBe('UNKNOWN');
  });

  it('does not leak error message internals into a generic UNKNOWN message', () => {
    const m = mapB2Error({ foo: 'bar' });
    expect(m.message).not.toContain('bar');
  });
});
