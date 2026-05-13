// Cart routes. Anonymous — no auth required (the chat-driven default flow
// lets browsers transact without logging in until checkout).
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as cart from '../services/cart.js';
import {
  GetCartQuerySchema,
  AddCartBodySchema,
  ModifyCartBodySchema,
  RemoveCartParamsSchema,
  RemoveCartQuerySchema,
  ResetCartBodySchema,
} from '../schemas/cart.js';

export const cartRouter: Router = Router();

cartRouter.get('/', validate({ query: GetCartQuerySchema }), (req, res) => {
  const { sessionId } = req.query as { sessionId: string };
  res.json({ cart: cart.getCart(sessionId) });
});

cartRouter.post('/', validate({ body: AddCartBodySchema }), async (req, res) => {
  const { sessionId, menuItemId, quantity } = req.body as {
    sessionId: string;
    menuItemId: string;
    quantity: number;
  };
  const next = await cart.addItem(sessionId, menuItemId, quantity);
  res.json({ cart: next });
});

cartRouter.patch('/', validate({ body: ModifyCartBodySchema }), async (req, res) => {
  const { sessionId, menuItemId, quantity } = req.body as {
    sessionId: string;
    menuItemId: string;
    quantity: number;
  };
  const next = await cart.modifyItem(sessionId, menuItemId, quantity);
  res.json({ cart: next });
});

cartRouter.delete(
  '/:menuItemId',
  validate({ params: RemoveCartParamsSchema, query: RemoveCartQuerySchema }),
  (req, res) => {
    const { menuItemId } = req.params as { menuItemId: string };
    const { sessionId } = req.query as { sessionId: string };
    const next = cart.removeItem(sessionId, menuItemId);
    res.json({ cart: next });
  },
);

cartRouter.post(
  '/reset',
  validate({ body: ResetCartBodySchema }),
  (req, res) => {
    const { sessionId } = req.body as { sessionId: string };
    const next = cart.clearCart(sessionId);
    res.json({ cart: next });
  },
);
