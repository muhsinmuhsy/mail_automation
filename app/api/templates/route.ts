import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { createTemplateSchema } from '@/lib/validation/template';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { ConflictError, ValidationError } from '@/lib/errors';
import { fromPrismaError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();
    const { page, limit, search } = parseListQuery(request, { search: true });

    const where = {
      user_id: user.id,
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [templates, total] = await Promise.all([
      getPrisma().template.findMany({
        where,
        select: { id: true, name: true, subject: true, created_at: true },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      getPrisma().template.count({ where }),
    ]);

    return respondList(templates, total, page, limit, requestId);
  } catch (err) {
    return respondError(err, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'template-create');
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(
        new ValidationError(
          'Please correct the highlighted fields.',
          Object.fromEntries(parsed.error.errors.map((e) => [e.path.join('.'), e.message]))
        ),
        requestId
      );
    }

    try {
      const template = await getPrisma().template.create({
        data: {
          user_id: user.id,
          name: parsed.data.name,
          subject: parsed.data.subject,
          body: parsed.data.body,
        },
        select: { id: true, name: true, subject: true, created_at: true },
      });

      return respondOk(template, requestId, 'Template created successfully.', 201);
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        return respondError(new ConflictError('This template already exists.'), requestId);
      }
      throw fromPrismaError(error);
    }
  } catch (err) {
    return respondError(err, requestId);
  }
}
