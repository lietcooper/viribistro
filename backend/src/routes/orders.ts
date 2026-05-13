// Order routes — both require a valid access token via requireAuth.
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { CreateOrderBodySchema } from '../schemas/orders.js';
import * as orders from '../services/orders.js';
import { AppError } from '../lib/AppError.js';

export const ordersRouter: Router = Router();

ordersRouter.post(
  '/',
  requireAuth,
  validate({ body: CreateOrderBodySchema }),
  async (req, res) => {
    const userId = req.user?.sub;
    if (!userId) {
      throw new AppError(401, 'NO_ACCESS_TOKEN', 'Missing user in token');
    }
    const { sessionId } = req.body as { sessionId: string };
    const order = await orders.confirmCart(userId, sessionId);
    res.status(201).json({ order });
  },
);

ordersRouter.get('/', requireAuth, async (req, res) => {
  const userId = req.user?.sub;
  if (!userId) {
    throw new AppError(401, 'NO_ACCESS_TOKEN', 'Missing user in token');
  }
  const list = await orders.listOrdersForUser(userId);
  res.json({ orders: list });
});
