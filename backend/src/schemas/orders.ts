import { z } from 'zod';

export const CreateOrderBodySchema = z.object({
  sessionId: z.string().min(1).max(128),
});
