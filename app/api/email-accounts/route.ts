import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { ConflictError, ValidationError, fromPrismaError } from '@/lib/errors';
import { createEmailAccountSchema } from '@/lib/validation/email-account';
import { encryptSecret } from '@/lib/security/encryption';

const _GET = defineRoute(async (req, ctx) => {
  const { page, limit, search } = parseListQuery(req, { search: true });

  const where = {
    user_id: ctx.user.id,
    ...(search ? { email: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [accounts, total] = await Promise.all([
    getPrisma().emailAccount.findMany({
      where,
      select: { id: true, provider: true, email: true, auth_method: true, connection_error: true, is_active: true, created_at: true },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    getPrisma().emailAccount.count({ where }),
  ]);

  return respondList(accounts, total, page, limit, ctx.requestId);
}, { auth: 'user' });

const _POST = defineRoute(async (req, ctx) => {
  const body = await req.json();
  const parsed = createEmailAccountSchema.safeParse(body);
  if (!parsed.success) {
    return respondError(
      new ValidationError(
        'Please correct the highlighted fields.',
        Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message]))
      ),
      ctx.requestId
    );
  }

  // App password disabled — commented out for future re-enablement
  // if (parsed.data.provider !== 'gmail' || parsed.data.auth_method !== 'app_password') {
  //   throw new ValidationError('Use Continue with Google to connect Gmail. Other providers are coming soon.');
  // }
  //
  // const encryptedSecret = await encryptSecret(parsed.data.secret, process.env.SMTP_ENCRYPTION_KEY!);
  //
  // try {
  //   const account = await getPrisma().emailAccount.create({
  //     data: {
  //       user_id: ctx.user.id,
  //       provider: parsed.data.provider,
  //       email: parsed.data.email,
  //       auth_method: parsed.data.auth_method,
  //       encrypted_secret: encryptedSecret,
  //     },
  //     select: { id: true, provider: true, email: true, is_active: true, created_at: true },
  //   });
  //
  //   return respondOk(account, ctx.requestId, 'Email account connected successfully.', 201);
  // } catch (error) {
  //   if ((error as { code?: string })?.code === 'P2002') {
  //     return respondError(new ConflictError('This email account is already connected.'), ctx.requestId);
  //   }
  //   throw fromPrismaError(error);
  // }
  throw new ValidationError('Use Continue with Google to connect Gmail. App password authentication is disabled.');
}, { auth: 'user', rateLimitKey: 'email-account-create' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}


export async function POST(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _POST(req, ctx);
}
