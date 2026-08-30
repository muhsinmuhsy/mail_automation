import { PrismaClient } from '../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient;
};

/**
 * Returns a process/worker-scoped Prisma client. A single instance is reused
 * across invocations to avoid exhausting database connections. The Neon
 * adapter is used so the client works in the Cloudflare Workers runtime.
 */
export function getPrisma(): PrismaClient {
  if (globalForPrisma.__prisma) {
    return globalForPrisma.__prisma;
  }

  const databaseUrl =
    process.env.DATABASE_URL ??
    (process.env as Record<string, string>).NEON_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured.');
  }

  const adapter = new PrismaNeon({ connectionString: databaseUrl });
  const client = new PrismaClient({ adapter });
  globalForPrisma.__prisma = client;
  return client;
}

export type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
