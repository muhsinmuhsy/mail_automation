import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';

export async function GET(request: NextRequest) {
  void request;
  const prisma = createPrisma(process.env.DATABASE_URL!);
  try {
    const session = await getSession();
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(failure('AUTHORIZATION_ERROR', 'Admin access required.'), { status: 403 });
    }

    const users = await prisma.user.count();
    const settings = await prisma.systemSetting.findUnique({ where: { id: 1 } });

    return NextResponse.json(success({
      totalUsers: users,
      settings,
    }));
  } catch {
    return NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
