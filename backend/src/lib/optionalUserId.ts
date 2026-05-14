import { logger } from './logger.js';
import { verifyAccessToken } from '../services/auth.js';

export function optionalUserId(
  req: { headers: { authorization?: string } },
  context: string,
): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;

  try {
    const payload = verifyAccessToken(token);
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch (err) {
    logger.debug({ err }, `${context} request carried an invalid Authorization header`);
    return null;
  }
}
