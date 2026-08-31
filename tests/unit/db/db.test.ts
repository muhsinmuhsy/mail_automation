import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/adapter-neon', () => ({
  PrismaNeon: class {
    options: unknown;
    constructor(options: unknown) {
      this.options = options;
    }
  },
}));

vi.mock('@/lib/generated/prisma/client', () => {
  const instances: unknown[] = [];
  class MockPrismaClient {
    adapter: unknown;
    $disconnect = vi.fn();
    $connect = vi.fn();
    $transaction = vi.fn();
    constructor(opts?: { adapter?: unknown }) {
      this.adapter = opts?.adapter;
      instances.push(this);
    }
  }
  return { PrismaClient: MockPrismaClient, __instances: instances };
});

import { PrismaClient } from '@/lib/generated/prisma/client';
import { createPrisma } from '@/lib/db/prisma';

describe('lib/db/prisma', () => {
  it('createPrisma returns a PrismaClient instance', () => {
    const client = createPrisma('postgresql://u:p@localhost:5432/db');
    expect(client).toBeInstanceOf(PrismaClient);
    expect(typeof client.$disconnect).toBe('function');
    expect((client as unknown as { adapter: unknown }).adapter).toBeDefined();
  });

  it('createPrisma accepts a Neon connection string', () => {
    const client = createPrisma('postgresql://u:p@localhost:5432/db');
    expect(client).toBeDefined();
  });
});

describe('lib/db/index (getPrisma)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns a cached singleton across calls', async () => {
    const mod = await import('@/lib/db');
    const a = mod.getPrisma();
    const b = mod.getPrisma();
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(PrismaClient);
  });

  it('throws when no database url is configured', async () => {
    const url = process.env.DATABASE_URL;
    const neon = process.env.NEON_DATABASE_URL;
    delete (globalThis as Record<string, unknown>).__prisma;
    vi.stubEnv('DATABASE_URL', '');
    delete process.env.NEON_DATABASE_URL;
    try {
      const mod = await import('@/lib/db');
      expect(() => mod.getPrisma()).toThrow(/DATABASE_URL is not configured/);
    } finally {
      if (url !== undefined) process.env.DATABASE_URL = url;
      if (neon !== undefined) process.env.NEON_DATABASE_URL = neon;
      vi.unstubAllEnvs();
    }
  });
});
