import { z } from 'zod';

const SessionId = z.string().min(1).max(128);
const MenuItemId = z.string().min(1).max(128);

export const GetCartQuerySchema = z.object({
  sessionId: SessionId,
});

export const AddCartBodySchema = z.object({
  sessionId: SessionId,
  menuItemId: MenuItemId,
  quantity: z.coerce.number().int().positive().max(99),
});

export const ModifyCartBodySchema = z.object({
  sessionId: SessionId,
  menuItemId: MenuItemId,
  // 0 is allowed: behave as "remove".
  quantity: z.coerce.number().int().min(0).max(99),
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
