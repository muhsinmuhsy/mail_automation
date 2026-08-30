import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondOk, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { createContactSchema } from '@/lib/validation/contact';
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
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [contacts, total] = await Promise.all([
      getPrisma().contact.findMany({
        where,
        select: { id: true, name: true, email: true, company: true, job_title: true },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      getPrisma().contact.count({ where }),
    ]);

    return respondList(contacts, total, page, limit, requestId);
  } catch (err) {
    return respondError(err, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'contact-create');
    if (rateLimitResult) return rateLimitResult;

    const body = await request.json();
    const parsed = createContactSchema.safeParse(body);
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
      const contact = await getPrisma().contact.create({
        data: {
          user_id: user.id,
          name: parsed.data.name,
          email: parsed.data.email,
          company: parsed.data.company,
          job_title: parsed.data.job_title,
          notes: parsed.data.notes,
        },
        select: { id: true, name: true, email: true, company: true, job_title: true },
      });

      return respondOk(contact, requestId, 'Contact added successfully.', 201);
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        return respondError(new ConflictError('This contact already exists.'), requestId);
      }
      throw fromPrismaError(error);
    }
  } catch (err) {
    return respondError(err, requestId);
  }
}
