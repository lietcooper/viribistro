// Augment Express's Request so handlers can read req.user without casting
// after requireAuth has run.
import type { TokenPayload } from '../services/auth.js';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export {};
