import { z } from 'zod';

// sessionId is opaque to the backend — frontend generates a UUID and reuses
// it for the lifetime of the chat. Cap at 128 chars to keep DB indexes
// pleasant.
const SessionId = z.string().min(1).max(128);

export const ChatBodySchema = z.object({
  sessionId: SessionId,
  message: z.string().min(1).max(4000),
});

export const ChatHistoryParamsSchema = z.object({
  sessionId: SessionId,
});
