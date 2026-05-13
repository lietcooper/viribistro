// Shared validator for the opaque sessionId the frontend mints. We accept
// any URL-safe token of reasonable length (typically a UUIDv4 from the
// frontend) — the constraint exists to keep the Conversation.sessionId
// column free of arbitrary user-supplied payloads. Symbols beyond the
// allowed alphabet would be a flag for client-side misuse, not a real
// chat session.
import { z } from 'zod';

export const SessionId = z
  .string()
  .min(1)
  .max(128)
  // Letters, digits, hyphen, underscore. Allows UUIDs ("a-b-c-d-e") and
  // any of our existing test fixtures ("chat-sess-1", "order-sess").
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'sessionId must contain only letters, digits, hyphen, or underscore',
  );
