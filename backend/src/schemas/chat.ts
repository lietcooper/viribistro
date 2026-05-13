import { z } from 'zod';
import { SessionId } from './sessionId.js';

// sessionId is opaque to the backend — frontend generates a UUID and reuses
// it for the lifetime of the chat. The shared SessionId validator caps the
// length and restricts the alphabet to keep the Conversation table tidy.

export const ChatBodySchema = z.object({
  sessionId: SessionId,
  message: z.string().min(1).max(4000),
});

export const ChatHistoryParamsSchema = z.object({
  sessionId: SessionId,
});
