import { z } from 'zod';

export const CategorySchema = z.enum(['starters', 'mains', 'desserts', 'drinks']);

export const MenuQuerySchema = z.object({
  category: CategorySchema.optional(),
});

// Prisma generates ids via @default(cuid()) — 25 chars: leading `c` plus
// 24 lowercase alphanumerics. Validating the shape here rejects nonsense
// IDs (e.g. injected scripts) at the edge so they never hit the DB and
// never clutter access logs.
const CUID_PATTERN = /^c[a-z0-9]{24}$/;

export const MenuParamsSchema = z.object({
  id: z.string().regex(CUID_PATTERN, 'Invalid menu item id format'),
});
