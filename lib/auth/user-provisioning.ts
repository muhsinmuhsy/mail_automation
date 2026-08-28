import { createPrisma } from '@/lib/db/prisma';

export async function ensureUserProfile(databaseUrl: string, userId: string, email: string, name?: string): Promise<void> {
  const prisma = createPrisma(databaseUrl);
  try {
    await prisma.user.upsert({
      where: { id: userId },
      update: { email },
      create: { id: userId, email, name },
    });
  } finally {
    await prisma.$disconnect();
  }
}
