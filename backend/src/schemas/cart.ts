import { z } from 'zod';
import { SessionId } from './sessionId.js';

const MenuItemId = z.string().min(1).max(128);
const CartItemId = z.string().min(1).max(128);
const Customizations = z.record(
  z.string().min(1).max(128),
  z.array(z.string().min(1).max(128)),
);

export const GetCartQuerySchema = z.object({
  sessionId: SessionId,
});

export const AddCartBodySchema = z.object({
  sessionId: SessionId,
  menuItemId: MenuItemId,
  quantity: z.coerce.number().int().positive().max(99),
  customizations: Customizations.optional(),
});

export const ModifyCartBodySchema = z
  .object({
    sessionId: SessionId,
    menuItemId: MenuItemId.optional(),
    cartItemId: CartItemId.optional(),
    // 0 is allowed: behave as "remove".
    quantity: z.coerce.number().int().min(0).max(99),
  })
  .refine((data) => data.menuItemId || data.cartItemId, {
    message: 'menuItemId or cartItemId is required',
    path: ['cartItemId'],
  });

export const RemoveCartParamsSchema = z.object({
  menuItemId: MenuItemId,
});

export const RemoveCartQuerySchema = z.object({
  sessionId: SessionId,
});

export const ResetCartBodySchema = z.object({
  sessionId: SessionId,
});
