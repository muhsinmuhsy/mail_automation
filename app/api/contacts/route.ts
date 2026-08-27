import { NextRequest, NextResponse } from 'next/server';
import { createPrisma } from '@/lib/db/prisma';
import { requireVerifiedSession } from '@/lib/auth/neon-auth';
import { failure, success } from '@/lib/errors/error-handler';
import { createContactSchema } from '@/lib/validation/contact';

export async function GET(request: NextRequest) {
  void request;
  const prisma = createPrisma(process.env.DATABASE_URL!);
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return NextResponse.json(sessionResult.error, { status: 401 });
    }

    const contacts = await prisma.contact.findMany({
      where: { user_id: sessionResult.session.user.id },
      select: { id: true, name: true, email: true, company: true, job_title: true },
    });

    return NextResponse.json(success(contacts));
  } catch {
    return NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(request: NextRequest) {
  const prisma = createPrisma(process.env.DATABASE_URL!);
  try {
    const sessionResult = await requireVerifiedSession();
    if ('error' in sessionResult) {
      return NextResponse.json(sessionResult.error, { status: 401 });
    }

    const body = await request.json();
    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        failure('VALIDATION_ERROR', 'Please correct the highlighted fields.', {
          fields: Object.fromEntries(parsed.error.errors.map(e => [e.path.join('.'), e.message])),
        }),
        { status: 400 }
      );
    }

    const contact = await prisma.contact.create({
      data: {
        user_id: sessionResult.session.user.id,
        name: parsed.data.name,
        email: parsed.data.email,
        company: parsed.data.company,
        job_title: parsed.data.job_title,
        notes: parsed.data.notes,
      },
      select: { id: true, name: true, email: true, company: true, job_title: true },
    });

    return NextResponse.json(success(contact, 'Contact added successfully.'), { status: 201 });
  } catch {
    return NextResponse.json(failure('INTERNAL_ERROR', 'We couldn\'t complete your request. Please try again.'), { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

