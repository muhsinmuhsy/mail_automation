import { NextRequest } from 'next/server';
import { getPrisma } from '@/lib/db';
import { defineRoute, type RouteParams } from '@/lib/api/route';
import { respondError, respondList } from '@/lib/api/respond';
import { parseListQuery } from '@/lib/api/list';
import { idParamSchema } from '@/lib/validation/common';
import { NotFoundError } from '@/lib/errors';

/**
 * GET /api/contacts/[id]/emails (§7).
 *
 * Contact email history — paginated list of email jobs for a specific contact
 * record. Ordered by (created_at DESC, id DESC). Shows stored subject,
 * recipient address, status, sent/scheduled timestamps, and campaign info.
 */
const _GET = defineRoute(async (req, ctx) => {
  const paramsParsed = idParamSchema.safeParse(ctx.params);
  if (!paramsParsed.success) {
    return respondError(
      new NotFoundError('Contact not found.'),
      ctx.requestId
    );
  }

  const { page, limit } = parseListQuery(req);

  // Verify the contact exists and belongs to the user.
  const contact = await getPrisma().contact.findFirst({
    where: { id: paramsParsed.data.id, user_id: ctx.user.id },
    select: { id: true, name: true, email: true },
  });

  if (!contact) {
    return respondError(
      new NotFoundError('Contact not found.'),
      ctx.requestId
    );
  }

  const where = {
    user_id: ctx.user.id,
    contact_id: paramsParsed.data.id,
  };

  const [jobs, total] = await Promise.all([
    getPrisma().emailJob.findMany({
      where,
      select: {
        id: true,
        to_email: true,
        subject: true,
        status: true,
        scheduled_at: true,
        sent_at: true,
        error_message: true,
        created_at: true,
        campaign: {
          select: { id: true, name: true, timezone: true },
        },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    getPrisma().emailJob.count({ where }),
  ]);

  const data = jobs.map((job) => ({
    id: job.id,
    recipientEmail: job.to_email,
    subject: job.subject,
    status: job.status,
    scheduledAt: job.scheduled_at.toISOString(),
    sentAt: job.sent_at?.toISOString() ?? null,
    errorMessage: job.error_message,
    createdAt: job.created_at.toISOString(),
    campaign: job.campaign
      ? {
          id: job.campaign.id,
          name: job.campaign.name,
          timezone: job.campaign.timezone,
        }
      : null,
  }));

  const response = respondList(data, total, page, limit, ctx.requestId);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}, { auth: 'user' });


export async function GET(req: NextRequest, ctx: { params: RouteParams } = { params: {} as RouteParams }) {
  return _GET(req, ctx);
}
