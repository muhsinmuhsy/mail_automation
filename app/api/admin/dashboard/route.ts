import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guards';
import { respondError, respondOk } from '@/lib/api/respond';

export async function GET(request: NextRequest) {
  void request;
  const requestId = crypto.randomUUID();
  try {
    await requireAdmin();

    const users = await getPrisma().user.count();
    const settings = await getPrisma().systemSetting.findUnique({ where: { id: 1 } });

    return respondOk({ totalUsers: users, settings }, requestId);
  } catch (err) {
    return respondError(err, requestId);
  }
}
