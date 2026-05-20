// Cart routes. Anonymous — no auth required (the chat-driven default flow
// lets browsers transact without logging in until checkout).
import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import * as cart from '../services/cart.js';
import { optionalUserId } from '../lib/optionalUserId.js';
import {
  GetCartQuerySchema,
  AddCartBodySchema,
  ModifyCartBodySchema,
  RemoveCartParamsSchema,
  RemoveCartQuerySchema,
  ResetCartBodySchema,
} from '../schemas/cart.js';

export const cartRouter: Router = Router();

function owner(req: { headers: { authorization?: string } }, sessionId: string) {
  return { sessionId, userId: optionalUserId(req, 'Cart') };
}

cartRouter.get('/', validate({ query: GetCartQuerySchema }), async (req, res) => {
  const { sessionId } = req.query as { sessionId: string };
  res.json({ cart: await cart.getCart(owner(req, sessionId)) });
});

cartRouter.post('/', validate({ body: AddCartBodySchema }), async (req, res) => {
  const { sessionId, menuItemId, quantity, customizations, note } = req.body as {
    sessionId: string;
    menuItemId: string;
    quantity: number;
    customizations?: Record<string, string[]>;
    note?: string;
  };
  const next = await cart.addItem(
    owner(req, sessionId),
    menuItemId,
    quantity,
    customizations,
    note,
  );
  res.json({ cart: next });
});

cartRouter.patch('/', validate({ body: ModifyCartBodySchema }), async (req, res) => {
  const { sessionId, menuItemId, cartItemId, quantity } = req.body as {
    sessionId: string;
    menuItemId?: string;
    cartItemId?: string;
    quantity: number;
  };
  // ModifyCartBodySchema.refine guarantees at least one of the two ids is
  // present — cast away the optional once we've fallen through the ??.
  const targetId = (cartItemId ?? menuItemId) as string;
  const next = await cart.modifyItem(owner(req, sessionId), targetId, quantity);
  res.json({ cart: next });
});

cartRouter.delete(
  '/:itemId',
  validate({ params: RemoveCartParamsSchema, query: RemoveCartQuerySchema }),
  async (req, res) => {
    const { itemId } = req.params as { itemId: string };
    const { sessionId } = req.query as { sessionId: string };
    const next = await cart.removeItem(owner(req, sessionId), itemId);
    res.json({ cart: next });
  },
);

// NOTE on route order: `DELETE /:itemId` is registered above and
// would match `/reset` if a client mistakenly sent DELETE to this path
// (no-op since no item has id "reset"). The method (POST vs DELETE)
// keeps them distinct — keep this route POST as the CLAUDE.md spec
// requires, and do not rename the param above to anything that could
// shadow a literal segment.
cartRouter.post('/reset', validate({ body: ResetCartBodySchema }), async (req, res) => {
  const { sessionId } = req.body as { sessionId: string };
  const next = await cart.clearCart(owner(req, sessionId));
  res.json({ cart: next });
});
