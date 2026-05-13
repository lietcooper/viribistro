// Order routes — both require a valid access token via requireAuth.
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { CreateOrderBodySchema } from '../schemas/orders.js';
import * as orders from '../services/orders.js';
import { authedUser } from '../lib/authedUser.js';

export const ordersRouter: Router = Router();

ordersRouter.post(
  '/',
  requireAuth,
  validate({ body: CreateOrderBodySchema }),
  async (req, res) => {
    const { sub: userId } = authedUser(req);
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
