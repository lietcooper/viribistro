// Narrow req.user to TokenPayload at runtime. Use AFTER requireAuth has
// gated the route; throws if invoked on an unauthenticated request, which
// would be a routing bug.
import type { TokenPayload } from '../services/auth.js';

export function authedUser(req: { user?: unknown }): TokenPayload {
  const u = req.user as TokenPayload | undefined;
  if (!u || typeof u.sub !== 'string') {
    throw new Error('authedUser() called without a valid req.user — wire requireAuth first');
  }
  return u;
}
