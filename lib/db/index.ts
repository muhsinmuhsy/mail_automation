import { PrismaClient } from '../generated/prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient;
};

/**
 * Returns a process-scoped Prisma client for the Next.js app/API runtime. A
 * single instance is reused to avoid exhausting database connections. The Neon
 * adapter keeps PostgreSQL access compatible with serverless runtimes.
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
