import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guards';
import { respondError, respondOk } from '@/lib/api/respond';

export async function GET(request: NextRequest) {
  void request;
  const requestId = crypto.randomUUID();
  try {
    await requireAdmin();

    const users = await getPrisma().user.findMany({
      select: { id: true, email: true, name: true, role: true, is_active: true, daily_email_limit_override: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });

    return respondOk(users, requestId);
  } catch (err) {
    return respondError(err, requestId);
  }
}
