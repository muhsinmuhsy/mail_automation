import { NextRequest } from 'next/server';
import { paginationSchema, sortSchema } from '@/lib/validation/common';

export interface ListQuery {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
  startDate?: string;
  endDate?: string;
}

export interface ListMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Parses standard list controls from the request query string:
 *  - `page` / `limit` (validated via {@link paginationSchema})
 *  - `search` (when `search` is enabled)
 *  - `sortBy` / `sortOrder` (validated against an allow-list of sortable
 *    columns when provided)
 *
 * Invalid values fall back to safe defaults rather than rejecting the request.
 */
export function parseListQuery(
  req: NextRequest,
  options: { search?: boolean; sortable?: readonly string[]; dateRange?: boolean } = {}
): ListQuery {
  const { searchParams } = new URL(req.url);

  const pagination = paginationSchema.parse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  });

  const sort = sortSchema.parse({
    sortBy: searchParams.get('sortBy') ?? undefined,
    sortOrder: searchParams.get('sortOrder') ?? undefined,
  });

  const search = options.search
    ? (searchParams.get('search')?.toString().trim() || undefined)
    : undefined;

  const sortBy =
    options.sortable && sort.sortBy && options.sortable.includes(sort.sortBy)
      ? sort.sortBy
      : undefined;

  const startDate = options.dateRange
    ? (searchParams.get('startDate')?.toString().trim() || undefined)
    : undefined;

  const endDate = options.dateRange
    ? (searchParams.get('endDate')?.toString().trim() || undefined)
    : undefined;

  return {
    page: pagination.page,
    limit: pagination.limit,
    search,
    sortBy,
    sortOrder: sort.sortOrder,
    startDate,
    endDate,
  };
}

export function listMeta(total: number, page: number, limit: number): ListMeta {
  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Build a Prisma `where` fragment for a date range filter on a single column.
 *
 * `startDate` is treated as inclusive (`gte`), `endDate` is inclusive of the
 * full day (`lte` with `T23:59:59.999Z` appended). Returns `{}` when neither
 * date is provided so the spread is a no-op.
 */
export function dateRangeWhere(
  field: string,
  startDate?: string,
  endDate?: string
): Record<string, { gte?: Date; lte?: Date }> {
  if (!startDate && !endDate) return {};
  return {
    [field]: {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate + 'T23:59:59.999Z') } : {}),
    },
  };
}
