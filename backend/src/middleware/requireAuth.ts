// Verifies a Bearer access token and attaches `req.user` (the decoded
// payload). Throws AppError(401, ...) on missing/invalid/expired tokens —
// the global error handler renders the JSON response.
import type { RequestHandler } from 'express';
import { AppError } from '../lib/AppError.js';
import { verifyAccessToken } from '../services/auth.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new AppError(401, 'NO_ACCESS_TOKEN', 'Missing or malformed Authorization header'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(new AppError(401, 'NO_ACCESS_TOKEN', 'Missing access token'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    // Cast through unknown — Express.User is intentionally loose (see
    // src/types/express.d.ts for why) so handlers use authedUser(req).
    (req as { user?: unknown }).user = payload;
    next();
  } catch {
    // Expired vs malformed — same user-visible outcome (re-auth required).
    next(new AppError(401, 'INVALID_ACCESS_TOKEN', 'Invalid or expired access token'));
  }
};
