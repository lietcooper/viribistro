// Tool dispatcher integration test. Uses the real cart service and the real
// seeded menu so we exercise the actual wiring — no mocks.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from '../helpers/resetDb.js';
import { prisma } from '../../src/lib/prisma.js';
import { seedMenu } from '../../prisma/seed.js';
import { dispatchTool } from '../../src/services/agent/tools.js';
import * as cartService from '../../src/services/cart.js';
import { AppError } from '../../src/lib/AppError.js';

const SESSION = 'dispatcher-test-sess';

describe('dispatchTool', () => {
  let burgerId: string;
  let salmonId: string;

  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
    const burger = await prisma.menuItem.findFirst({
      where: { name: 'Wagyu Beef Burger' },
    });
    const salmon = await prisma.menuItem.findFirst({
      where: { name: 'Pan-Seared Salmon' },
    });
    if (!burger || !salmon) throw new Error('seed missing fixture items');
    burgerId = burger.id;
    salmonId = salmon.id;
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    cartService.clearCart(SESSION);
  });

  it('add_to_cart succeeds and returns a tool_result with cart payload', async () => {
    const res = await dispatchTool(
      { id: 'tu_1', name: 'add_to_cart', input: { itemId: burgerId, quantity: 2 } },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.tool_use_id).toBe('tu_1');
    expect(res.is_error).toBeUndefined();
    expect(res.mutated).toBe(true);
    const parsed = JSON.parse(res.content) as {
      cart: { items: Array<{ menuItemId: string; quantity: number }>; total: string };
    };
    expect(parsed.cart.items[0]?.menuItemId).toBe(burgerId);
    expect(parsed.cart.items[0]?.quantity).toBe(2);
  });

  it('clarify returns a sentinel object (not a tool_result) for the loop to short-circuit', async () => {
    const res = await dispatchTool(
      { id: 'tu_2', name: 'clarify', input: { question: 'Red or white wine?' } },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('clarify');
    if (res.type !== 'clarify') throw new Error('unreachable');
    expect(res.question).toBe('Red or white wine?');
  });

  it('rejects malformed input with is_error tool_result (recoverable inside loop)', async () => {
    const res = await dispatchTool(
      {
        id: 'tu_3',
        name: 'add_to_cart',
        // missing itemId, quantity wrong type
        input: { quantity: 'lots' },
      },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.is_error).toBe(true);
    const parsed = JSON.parse(res.content) as { error: string };
    expect(parsed.error).toBe('INVALID_TOOL_INPUT');
    // The cart was not touched.
    expect(cartService.getCart(SESSION).items).toEqual([]);
  });

  it('passes cart-service AppErrors back as recoverable tool_result errors', async () => {
    const res = await dispatchTool(
      {
        id: 'tu_4',
        name: 'add_to_cart',
        input: { itemId: 'cthisdoesnotexist', quantity: 1 },
      },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.is_error).toBe(true);
    const parsed = JSON.parse(res.content) as { error: string; message: string };
    expect(parsed.error).toBe('UNKNOWN_MENU_ITEM');
    expect(parsed.message).toMatch(/Menu item not found/);
  });

  it('throws AppError for an unknown tool name (programmer error, not LLM)', async () => {
    await expect(
      dispatchTool(
        { id: 'tu_5', name: 'flambe', input: {} },
        { sessionId: SESSION },
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('get_cart returns the current cart without mutating', async () => {
    await cartService.addItem(SESSION, burgerId, 1);
    const res = await dispatchTool(
      { id: 'tu_6', name: 'get_cart', input: {} },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.mutated).toBe(false);
    const parsed = JSON.parse(res.content) as {
      cart: { items: Array<{ menuItemId: string }> };
    };
    expect(parsed.cart.items[0]?.menuItemId).toBe(burgerId);
  });

  it('get_menu filters by category when supplied', async () => {
    const res = await dispatchTool(
      { id: 'tu_7', name: 'get_menu', input: { category: 'desserts' } },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.mutated).toBe(false);
    const parsed = JSON.parse(res.content) as {
      menu: Array<{ category: string }>;
    };
    expect(parsed.menu.length).toBeGreaterThan(0);
    for (const item of parsed.menu) {
      expect(item.category).toBe('desserts');
    }
  });

  it('modify_item with newQuantity=0 removes the item from the cart', async () => {
    await cartService.addItem(SESSION, salmonId, 3);
    const res = await dispatchTool(
      {
        id: 'tu_8',
        name: 'modify_item',
        input: { itemId: salmonId, newQuantity: 0 },
      },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.mutated).toBe(true);
    expect(cartService.getCart(SESSION).items).toEqual([]);
  });

  it('remove_from_cart removes an item by id', async () => {
    await cartService.addItem(SESSION, burgerId, 2);
    const res = await dispatchTool(
      { id: 'tu_9', name: 'remove_from_cart', input: { itemId: burgerId } },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.mutated).toBe(true);
    expect(cartService.getCart(SESSION).items).toEqual([]);
  });
});
