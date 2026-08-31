import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/generated/prisma/client', () => ({
  PrismaClient: class {
    $disconnect = () => {};
    $queryRaw = () => {};
    $transaction = () => {};
  },
}));

import { PrismaClient } from '@/lib/generated/prisma/client';
import { createPrisma } from '@/lib/db/prisma';
import { getPrisma } from '@/lib/db';

describe('integration/db (factory, no real database)', () => {
  it('createPrisma builds a PrismaClient instance', () => {
    const client = createPrisma('postgresql://u:p@localhost:5432/db');
    expect(client).toBeInstanceOf(PrismaClient);
    expect(typeof client.$disconnect).toBe('function');
    expect(typeof client.$queryRaw).toBe('function');
  });

  it('getPrisma returns a process-scoped cached singleton', () => {
    const a = getPrisma();
    const b = getPrisma();
    expect(a).toBe(b);
    expect(a).toBeInstanceOf(PrismaClient);
  });

  it('getPrisma throws when no database url is configured', async () => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>).__prisma;
    const neon = process.env.NEON_DATABASE_URL;
    delete process.env.NEON_DATABASE_URL;
    vi.stubEnv('DATABASE_URL', '');
    try {
      const mod = await import('@/lib/db');
      expect(() => mod.getPrisma()).toThrow(/DATABASE_URL is not configured/);
    } finally {
      vi.unstubAllEnvs();
      if (neon !== undefined) process.env.NEON_DATABASE_URL = neon;
    }
  });

  it('getPrisma falls back to NEON_DATABASE_URL when DATABASE_URL is absent', async () => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>).__prisma;
    const url = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    process.env.NEON_DATABASE_URL = 'postgresql://neon:neon@localhost:5432/neon';
    try {
      const mod = await import('@/lib/db');
      const client = mod.getPrisma();
      expect(typeof client.$disconnect).toBe('function');
    } finally {
      if (url !== undefined) process.env.DATABASE_URL = url;
      delete process.env.NEON_DATABASE_URL;
    }
  });
});
