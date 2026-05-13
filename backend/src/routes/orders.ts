// Order routes.
//
// Auth model:
//   - POST /api/orders is *optionally* authenticated. The demo lets an
//     anonymous visitor build a cart in chat and place an order; the row
//     stores userId = null in that case. When a Bearer token IS present
//     and valid, we attach the userId so GET /api/orders can find it.
//   - GET /api/orders is gated by requireAuth — listing past orders only
//     makes sense for a known user.
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../lib/logger.js';
import { CreateOrderBodySchema } from '../schemas/orders.js';
import * as orders from '../services/orders.js';
import { authedUser } from '../lib/authedUser.js';
import { verifyAccessToken } from '../services/auth.js';

/**
 * If the request carries a valid Bearer access token, return the user id.
 * Otherwise return null. Anonymous checkout is allowed, so an invalid
 * header is never an error — but we log at debug so a permanent flood is
 * still visible to operators (CLAUDE.md: no silent failures).
 */
function optionalUserId(req: { headers: { authorization?: string } }): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;
  try {
    const payload = verifyAccessToken(token);
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch (err) {
    logger.debug(
      { err },
      'Order request carried an invalid Authorization header — proceeding as guest',
    );
    return null;
  }
}

export const ordersRouter: Router = Router();

ordersRouter.post(
  '/',
  validate({ body: CreateOrderBodySchema }),
  async (req, res) => {
    const userId = optionalUserId(req);
    const { sessionId } = req.body as { sessionId: string };
    const order = await orders.confirmCart(userId, sessionId);
    res.status(201).json({ order });
  },
);

ordersRouter.get('/', requireAuth, async (req, res) => {
  const { sub: userId } = authedUser(req);
  const list = await orders.listOrdersForUser(userId);
  res.json({ orders: list });
});
