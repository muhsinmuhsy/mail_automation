import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk } from '@/lib/api/respond';
import { ValidationError } from '@/lib/errors';
import { adminSettingsSchema } from '@/lib/validation/admin';

const _GET = defineRoute(async (_req, ctx) => {
  const settings = await getPrisma().systemSetting.findUnique({ where: { id: 1 } });
  return respondOk(settings, ctx.requestId);
}, { auth: 'admin' });

const _PATCH = defineRoute(async (req, ctx) => {
  const body = await req.json();
  const parsed = adminSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
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

  return respondOk(settings, ctx.requestId, 'Settings updated.');
}, { auth: 'admin', rateLimitKey: 'admin-settings' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}


export async function PATCH(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _PATCH(req, ctx);
}
