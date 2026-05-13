import { z } from 'zod';

export const CategorySchema = z.enum(['starters', 'mains', 'desserts', 'drinks']);

export const MenuQuerySchema = z.object({
  category: CategorySchema.optional(),
});

export const MenuParamsSchema = z.object({
  id: z.string().min(1),
});
