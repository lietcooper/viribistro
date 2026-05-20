// Tool definitions for the AI agent.
//
// `toolSchemas` is the array we pass to Anthropic's `messages.create({ tools })`.
// Each tool's JSON schema is mirrored by a Zod schema in `toolInputZod` so the
// dispatcher can validate the *parsed* tool input the SDK hands us before we
// touch the cart service — Anthropic does not enforce JSON schemas on the
// server side, only nudges the model with them.
//
// Tools intentionally mirror the verbs in CLAUDE.md (line 95-101).
// The cart-mutating tools wrap services/cart.ts so REST and chat operate on
// the same in-memory store (no duplication).
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { AppError } from '../../lib/AppError.js';
import * as cart from '../cart.js';
import { normalizePrice } from '../cart.js';

export const toolSchemas: Anthropic.Tool[] = [
  {
    name: 'add_to_cart',
    description:
      'Add a menu item to the cart by its exact menuItemId. Quantity defaults to 1. ' +
      'Include customizations as { groupId: [optionId] } when the item has required choices. ' +
      'Stacks with any existing quantity for the same item and same customizations.',
    input_schema: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'The exact menu item ID from the menu snapshot in the system prompt.',
        },
        quantity: {
          type: 'integer',
          minimum: 1,
          description: 'How many to add. Defaults to 1 if omitted.',
        },
        customizations: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
          description: 'Selected customization option IDs keyed by customization group ID.',
        },
      },
      required: ['itemId'],
    },
  },
  {
    name: 'remove_from_cart',
    description:
      'Remove an entire cart line from the cart. Prefer cartItemId from CURRENT CART. ' +
      'Use itemId only when exactly one cart line matches that menu item. For "remove one" ' +
      'or quantity reductions, use modify_item with the decremented quantity instead.',
    input_schema: {
      type: 'object',
      properties: {
        cartItemId: {
          type: 'string',
          description:
            'The exact cart line ID from CURRENT CART. Preferred for customized items.',
        },
        itemId: {
          type: 'string',
          description:
            'Fallback exact menu item ID. Safe only when one cart line has this menuItemId.',
        },
      },
      required: [],
    },
  },
  {
    name: 'modify_item',
    description:
      'Set one cart line quantity to an exact new value. Prefer cartItemId from CURRENT CART. ' +
      'Use this for quantity reductions like "remove one" by sending the decremented quantity. ' +
      "A newQuantity of 0 removes the cart line. If itemId is used and the item isn't in the cart yet, " +
      'a positive newQuantity adds the uncustomized item.',
    input_schema: {
      type: 'object',
      properties: {
        cartItemId: {
          type: 'string',
          description:
            'The exact cart line ID from CURRENT CART. Preferred for customized items.',
        },
        itemId: {
          type: 'string',
          description:
            'Fallback exact menu item ID. Safe only when one cart line has this menuItemId.',
        },
        newQuantity: { type: 'integer', minimum: 0 },
      },
      required: ['newQuantity'],
    },
  },
  {
    name: 'get_cart',
    description:
      'Return the current cart for this session. Use this when the user asks ' +
      "what's in their cart or to confirm a running total.",
    input_schema: {
      type: 'object',
      properties: {},
      // Anthropic's JSON-schema validator expects `required` to be present
      // even on zero-arg tools — omitting it can produce a stricter
      // "schema invalid" error on some model versions.
      required: [],
    },
  },
  {
    name: 'get_menu',
    description:
      'Return the live menu, optionally filtered to a category. The menu in the ' +
      'system prompt is already injected, so call this only if you need a refreshed ' +
      'snapshot or a category-scoped view.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['starters', 'mains', 'desserts', 'drinks'],
          description: 'Optional category filter.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_item_customizations',
    description:
      'Return customization groups/options for one menu item. Use this before adding an item when required choices are missing.',
    input_schema: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'The exact menu item ID from the menu snapshot.',
        },
      },
      required: ['itemId'],
    },
  },
  {
    name: 'clarify',
    description:
      'Ask the user a follow-up question when their request is ambiguous (e.g. ' +
      'they say "a burger" and two burgers exist) instead of guessing. This ENDS ' +
      'the current turn — the question is shown to the user as your reply.',
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description:
            'The follow-up question to show the user. Be specific and name the candidates.',
        },
      },
      required: ['question'],
    },
  },
];

// Runtime validation for what the SDK actually hands us (already-parsed JSON).
// Anthropic's SDK does not enforce the `input_schema`, so we MUST validate
// before mutating the cart.
const Category = z.enum(['starters', 'mains', 'desserts', 'drinks']);
const SelectedCustomizations = z.record(z.string().min(1), z.array(z.string().min(1)));

export const toolInputZod = {
  add_to_cart: z.object({
    itemId: z.string().min(1),
    quantity: z.number().int().positive().optional(),
    customizations: SelectedCustomizations.optional(),
  }),
  remove_from_cart: z
    .object({
      cartItemId: z.string().min(1).optional(),
      itemId: z.string().min(1).optional(),
    })
    .refine((data) => data.cartItemId || data.itemId, {
      message: 'cartItemId or itemId is required',
      path: ['cartItemId'],
    }),
  modify_item: z
    .object({
      cartItemId: z.string().min(1).optional(),
      itemId: z.string().min(1).optional(),
      newQuantity: z.number().int().min(0),
    })
    .refine((data) => data.cartItemId || data.itemId, {
      message: 'cartItemId or itemId is required',
      path: ['cartItemId'],
    }),
  get_cart: z.object({}).passthrough(),
  get_menu: z.object({
    category: Category.optional(),
  }),
  get_item_customizations: z.object({
    itemId: z.string().min(1),
  }),
  clarify: z.object({
    question: z.string().min(1),
  }),
} as const;

export type ToolName = keyof typeof toolInputZod;

// ─── Dispatcher (introduced in step 3) ─────────────────────────────────────
//
// Two outcome shapes:
//   - `tool_result` block to feed back to the model
//   - `clarify` short-circuit marker the loop runner intercepts
export type DispatchResult =
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
      // Surface which tool produced it (for `toolsUsed` accounting + tests).
      toolName: ToolName;
      // Did this tool mutate the cart? Drives the `cartUpdate` field on the
      // response envelope.
      mutated: boolean;
    }
  | {
      type: 'clarify';
      question: string;
      toolName: 'clarify';
    };

export interface DispatchContext {
  sessionId: string;
  userId?: string | null;
}

interface ToolUseLike {
  id: string;
  name: string;
  input: unknown;
}

/**
 * Execute a single tool_use block. Validates input with Zod first; on failure
 * returns an `is_error: true` tool_result so the model can recover (per
 * CLAUDE.md line 17: no silent failures, but recoverable errors stay in-loop).
 */
export async function dispatchTool(
  block: ToolUseLike,
  ctx: DispatchContext,
): Promise<DispatchResult> {
  if (!(block.name in toolInputZod)) {
    // Unknown tool is a *programmer* error (we shipped a mismatched schema).
    // Throw so the loop's outer error handler returns a 500.
    throw new AppError(500, 'UNKNOWN_TOOL', `LLM called unknown tool: ${block.name}`);
  }
  // Safe to narrow now that the `in` guard above has run.
  const name = block.name as ToolName;

  const schema = toolInputZod[name];
  const parsed = schema.safeParse(block.input);
  if (!parsed.success) {
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      content: JSON.stringify({
        error: 'INVALID_TOOL_INPUT',
        message: 'The tool input did not match its schema. Re-read the schema and try again.',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      }),
      is_error: true,
      toolName: name,
      mutated: false,
    };
  }

  const input = parsed.data;

  try {
    switch (name) {
      case 'add_to_cart': {
        const { itemId, quantity = 1 } = input as z.infer<
          (typeof toolInputZod)['add_to_cart']
        >;
        const { customizations } = input as z.infer<(typeof toolInputZod)['add_to_cart']>;
        const next = await cart.addItem(ctx, itemId, quantity, customizations);
        return resultOk(block.id, name, true, { cart: next });
      }
      case 'remove_from_cart': {
        const { cartItemId, itemId } = input as z.infer<
          (typeof toolInputZod)['remove_from_cart']
        >;
        const next = await cart.removeItem(ctx, cartItemId ?? itemId!);
        return resultOk(block.id, name, true, { cart: next });
      }
      case 'modify_item': {
        const { cartItemId, itemId, newQuantity } = input as z.infer<
          (typeof toolInputZod)['modify_item']
        >;
        const next = await cart.modifyItem(ctx, cartItemId ?? itemId!, newQuantity);
        return resultOk(block.id, name, true, { cart: next });
      }
      case 'get_cart': {
        const snap = await cart.getCart(ctx);
        return resultOk(block.id, name, false, { cart: snap });
      }
      case 'get_menu': {
        const { category } = input as z.infer<(typeof toolInputZod)['get_menu']>;
        const menu = await loadMenuForTool(category);
        return resultOk(block.id, name, false, { menu });
      }
      case 'get_item_customizations': {
        const { itemId } = input as z.infer<(typeof toolInputZod)['get_item_customizations']>;
        const customizations = await loadItemCustomizationsForTool(itemId);
        return resultOk(block.id, name, false, { customizations });
      }
      case 'clarify': {
        const { question } = input as z.infer<(typeof toolInputZod)['clarify']>;
        return { type: 'clarify', question, toolName: 'clarify' };
      }
    }
  } catch (err) {
    // Domain errors (AppError) come from the cart service — for example,
    // an unknown menuItemId. Feed them back to the model as a recoverable
    // tool_result so it can apologize / ask the user, instead of crashing
    // the request.
    if (err instanceof AppError) {
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify({ error: err.code, message: err.message }),
        is_error: true,
        toolName: name,
        mutated: false,
      };
    }
    throw err;
  }
}

function resultOk(
  toolUseId: string,
  toolName: ToolName,
  mutated: boolean,
  body: Record<string, unknown>,
): DispatchResult {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: JSON.stringify(body),
    toolName,
    mutated,
  };
}

// Lazy import to avoid a circular dep with services/menu.
async function loadMenuForTool(
  category?: 'starters' | 'mains' | 'desserts' | 'drinks',
): Promise<unknown> {
  const { prisma } = await import('../../lib/prisma.js');
  const where = category ? { category, available: true } : { available: true };
  const items = await prisma.menuItem.findMany({
    where,
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      category: true,
      tags: true,
      customizationGroups: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          required: true,
          minSelect: true,
          maxSelect: true,
          options: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              name: true,
              priceDelta: true,
              available: true,
            },
          },
        },
      },
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  // Decimal → string for JSON safety.
  return items.map((i) => ({
    ...i,
    price: i.price.toString(),
    customizationGroups: i.customizationGroups.map((group) => ({
      ...group,
      options: group.options.map((option) => ({
        ...option,
        priceDelta: normalizePrice(option.priceDelta),
      })),
    })),
  }));
}

async function loadItemCustomizationsForTool(itemId: string): Promise<unknown> {
  const { prisma } = await import('../../lib/prisma.js');
  const item = await prisma.menuItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      name: true,
      available: true,
      customizationGroups: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          required: true,
          minSelect: true,
          maxSelect: true,
          options: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              name: true,
              priceDelta: true,
              available: true,
            },
          },
        },
      },
    },
  });
  if (!item || !item.available) {
    throw new AppError(400, 'UNKNOWN_MENU_ITEM', `Menu item not found: ${itemId}`);
  }
  return item.customizationGroups.map((group) => ({
    ...group,
    options: group.options.map((option) => ({
      ...option,
      priceDelta: normalizePrice(option.priceDelta),
    })),
  }));
}
