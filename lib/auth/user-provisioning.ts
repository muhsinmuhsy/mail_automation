import { createPrisma } from '@/lib/db/prisma';

export async function ensureUserProfile(userId: string, email: string, name?: string): Promise<void> {
  const prisma = createPrisma(process.env.DATABASE_URL!);
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
