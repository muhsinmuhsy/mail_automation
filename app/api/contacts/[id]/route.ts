import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireVerifiedUser } from '@/lib/api/session';
import { respondError, respondOk } from '@/lib/api/respond';
import { idParamSchema } from '@/lib/validation/common';
import { updateContactSchema } from '@/lib/validation/contact';
import { checkApiRateLimit } from '@/lib/rate-limit/api';
import { NotFoundError, ValidationError } from '@/lib/errors';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'contact-update');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    const body = await request.json();
    const updateParsed = updateContactSchema.safeParse(body);
    if (!updateParsed.success) {
      return respondError(
        new ValidationError(
          'Please correct the highlighted fields.',
          Object.fromEntries(updateParsed.error.errors.map((e) => [e.path.join('.'), e.message]))
        ),
        requestId
      );
    }

    const result = await getPrisma().contact.updateMany({
      where: { id: parsed.data.id, user_id: user.id },
      data: updateParsed.data,
    });

    if (result.count === 0) {
      return respondError(new NotFoundError('Contact not found.'), requestId);
    }

    return respondOk(null, requestId, 'Contact updated.');
  } catch (err) {
    return respondError(err, requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  void request;
  const requestId = crypto.randomUUID();
  try {
    const user = await requireVerifiedUser();

    const rateLimitResult = await checkApiRateLimit(request, user.id, 'contact-delete');
    if (rateLimitResult) return rateLimitResult;

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return respondError(new ValidationError('Invalid ID.'), requestId);
    }

    await getPrisma().contact.deleteMany({
      where: { id: parsed.data.id, user_id: user.id },
    });

    return respondOk(null, requestId, 'Contact deleted.');
  } catch (err) {
    return respondError(err, requestId);
  }
}
