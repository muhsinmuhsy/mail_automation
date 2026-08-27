import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { idParamSchema } from '@/lib/validation/common';
import { updateContactSchema } from '@/lib/validation/contact';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return NextResponse.json(sessionResult.error, { status: 401 });
    }

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 });
    }

    const body = await request.json();
    const updateParsed = updateContactSchema.safeParse(body);
    if (!updateParsed.success) {
      return NextResponse.json(
        failure('VALIDATION_ERROR', 'Please correct the highlighted fields.', {
          fields: Object.fromEntries(updateParsed.error.errors.map(e => [e.path.join('.'), e.message])),
        }),
        { status: 400 }
      );
    }

    const contact = await prisma.contact.updateMany({
      where: { id: parsed.data.id, user_id: sessionResult.session.user.id },
      data: updateParsed.data,
    });

    if (contact.count === 0) {
      return NextResponse.json(failure('NOT_FOUND', 'Contact not found.'), { status: 404 });
    }

    return NextResponse.json(success(null, 'Contact updated.'));
  } catch {
    return NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;
  const prisma = createPrisma(process.env.DATABASE_URL!);
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return NextResponse.json(sessionResult.error, { status: 401 });
    }

    const { id } = await params;
    const parsed = idParamSchema.safeParse({ id });
    if (!parsed.success) {
      return NextResponse.json(failure('VALIDATION_ERROR', 'Invalid ID.'), { status: 400 });
    }

    await prisma.contact.deleteMany({
      where: { id: parsed.data.id, user_id: sessionResult.session.user.id },
    });

    return NextResponse.json(success(null, 'Contact deleted.'));
  } catch {
    return NextResponse.json(failure('NOT_FOUND', 'Contact not found.'), { status: 404 });
  } finally {
    await prisma.$disconnect();
  }
}
