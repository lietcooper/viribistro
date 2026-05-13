import { z } from 'zod';
import { SessionId } from './sessionId.js';

export const CreateOrderBodySchema = z.object({
  sessionId: SessionId,
});
