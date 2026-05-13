// Augment Express so passport's verify callbacks remain typeable while
// requireAuth populates req.user with our TokenPayload. We keep Express.User
// as a loose record so passport calls like `done(null, prismaUser)` (which
// pass a Prisma row, NOT a TokenPayload) still type-check. Handlers that
// rely on requireAuth should use the runtime helper `authedUser()` from
// src/lib/authedUser.ts to narrow req.user to a TokenPayload.
import type { TokenPayload as _TokenPayload } from '../services/auth.js';

declare global {
  namespace Express {
    interface User extends Record<string, unknown> {}
  }
}

export {};

// Reference _TokenPayload so the import isn't elided. The actual narrowing
// happens at runtime in authedUser().
export type _UnusedTokenPayload = _TokenPayload;
