import { z } from 'zod';

export const uuid = z.string().uuid();
export const email = z.string().email().max(255);
export const positiveInt = z.number().int().positive();
export const nonEmptyString = z.string().min(1);
export const maxLength = (max: number) => z.string().max(max);

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const idParamSchema = z.object({
  id: uuid,
});
