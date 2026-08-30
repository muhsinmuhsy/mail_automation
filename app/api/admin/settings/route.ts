import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guards';
import { ValidationError } from '@/lib/errors';
import { adminSettingsSchema } from '@/lib/validation/admin';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { respondError, respondOk } from '@/lib/api/respond';

export async function GET(request: NextRequest) {
  void request;
  const requestId = crypto.randomUUID();
  try {
    await requireAdmin();

    const settings = await getPrisma().systemSetting.findUnique({ where: { id: 1 } });
    return respondOk(settings, requestId);
  } catch (err) {
    return respondError(err, requestId);
  }
}

export async function PATCH(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { sessionUser } = await requireAdmin();

    const rateLimitResult = await checkApiRateLimit(request, sessionUser.id, 'admin-settings');
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const parsed = adminSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(
        new ValidationError(
          'Please correct the highlighted fields.',
          Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message]))
        ),
        requestId
      );
    }

    const settings = await getPrisma().systemSetting.update({
      where: { id: 1 },
      data: {
        default_daily_email_limit: parsed.data.default_daily_email_limit,
        global_daily_email_limit: parsed.data.global_daily_email_limit,
        email_sending_enabled: parsed.data.email_sending_enabled,
      },
    });

    return respondOk(settings, requestId, 'Settings updated.');
  } catch (err) {
    return respondError(err, requestId);
  }
}
