import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { ConflictError, ValidationError, fromPrismaError } from '@/lib/errors';
import { createEmailAccountSchema } from '@/lib/validation/email-account';
import { encryptSecret } from '@/lib/security/encryption';
import { checkApiRateLimit } from '@/lib/rate-limit/api';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();
    const { page, limit, search } = parseListQuery(request, { search: true });

    const where = {
      user_id: user.id,
      ...(search ? { email: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [accounts, total] = await Promise.all([
      getPrisma().emailAccount.findMany({
        where,
        select: { id: true, provider: true, email: true, is_active: true, created_at: true },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      getPrisma().emailAccount.count({ where }),
    ]);

    return respondList(accounts, total, page, limit, requestId);
  } catch (err) {
    return respondError(err, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'email-account-create');
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const parsed = createEmailAccountSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(
        new ValidationError(
          'Please correct the highlighted fields.',
          Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message]))
        ),
        requestId
      );
    }

    const encryptedSecret = await encryptSecret(parsed.data.secret, process.env.SMTP_ENCRYPTION_KEY!);

    try {
      const account = await getPrisma().emailAccount.create({
        data: {
          user_id: user.id,
          provider: parsed.data.provider,
          email: parsed.data.email,
          auth_method: parsed.data.auth_method,
          encrypted_secret: encryptedSecret,
        },
        select: { id: true, provider: true, email: true, is_active: true, created_at: true },
      });

      return respondOk(account, requestId, 'Email account connected successfully.', 201);
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        return respondError(new ConflictError('This email account is already connected.'), requestId);
      }
      throw fromPrismaError(error);
    }
  } catch (err) {
    return respondError(err, requestId);
  }
}
