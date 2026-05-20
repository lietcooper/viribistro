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
  let burgerCustomizations: Record<string, string[]>;
  let burgerBlueCheeseCustomizations: Record<string, string[]>;

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
    const temperature = await prisma.customizationGroup.findFirst({
      where: { menuItemId: burger.id, name: 'Temperature' },
      include: { options: true },
    });
    const cheese = await prisma.customizationGroup.findFirst({
      where: { menuItemId: burger.id, name: 'Cheese' },
      include: { options: true },
    });
    const mediumRare = temperature?.options.find((o) => o.name === 'Medium rare');
    const blue = cheese?.options.find((o) => o.name === 'Blue cheese');
    if (!temperature || !mediumRare || !cheese || !blue) {
      throw new Error('seed missing burger customizations');
    }
    burgerCustomizations = { [temperature.id]: [mediumRare.id] };
    burgerBlueCheeseCustomizations = {
      [temperature.id]: [mediumRare.id],
      [cheese.id]: [blue.id],
    };
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cartService.clearCart(SESSION);
  });

  it('add_to_cart succeeds and returns a tool_result with cart payload', async () => {
    const res = await dispatchTool(
      {
        id: 'tu_1',
        name: 'add_to_cart',
        input: { itemId: burgerId, quantity: 2, customizations: burgerCustomizations },
      },
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

  it('add_to_cart returns a recoverable error when required customizations are missing', async () => {
    const res = await dispatchTool(
      { id: 'tu_missing', name: 'add_to_cart', input: { itemId: burgerId, quantity: 1 } },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.is_error).toBe(true);
    const parsed = JSON.parse(res.content) as { error: string };
    expect(parsed.error).toBe('MISSING_REQUIRED_CUSTOMIZATION');
    expect((await cartService.getCart(SESSION)).items).toEqual([]);
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
    expect((await cartService.getCart(SESSION)).items).toEqual([]);
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
      dispatchTool({ id: 'tu_5', name: 'flambe', input: {} }, { sessionId: SESSION }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('get_cart returns the current cart without mutating', async () => {
    await cartService.addItem(SESSION, burgerId, 1, burgerCustomizations);
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

  it('get_item_customizations returns groups and options for one item', async () => {
    const res = await dispatchTool(
      { id: 'tu_custom', name: 'get_item_customizations', input: { itemId: burgerId } },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.mutated).toBe(false);
    const parsed = JSON.parse(res.content) as {
      customizations: Array<{ name: string; options: Array<{ name: string }> }>;
    };
    expect(parsed.customizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Temperature',
          options: expect.arrayContaining([expect.objectContaining({ name: 'Medium rare' })]),
        }),
      ]),
    );
  });

  it('get_item_customizations returns a recoverable error for an unknown itemId', async () => {
    const res = await dispatchTool(
      {
        id: 'tu_custom_missing',
        name: 'get_item_customizations',
        input: { itemId: 'cnotarealitemid' },
      },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.is_error).toBe(true);
    expect(res.mutated).toBe(false);
    const parsed = JSON.parse(res.content) as { error: string; message: string };
    expect(parsed.error).toBe('UNKNOWN_MENU_ITEM');
    expect(parsed.message).toMatch(/Menu item not found/);
  });

  it('clear_cart empties the cart and returns mutated=true', async () => {
    await cartService.addItem(SESSION, burgerId, 1, burgerCustomizations);
    await cartService.addItem(SESSION, salmonId, 2);
    expect((await cartService.getCart(SESSION)).items.length).toBe(2);

    const res = await dispatchTool(
      { id: 'tu_clear', name: 'clear_cart', input: {} },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.mutated).toBe(true);
    const parsed = JSON.parse(res.content) as {
      cart: { items: unknown[]; total: string };
    };
    expect(parsed.cart.items).toEqual([]);
    expect(parsed.cart.total).toBe('0.00');
    // And the real cart is empty too.
    expect((await cartService.getCart(SESSION)).items).toEqual([]);
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
    expect((await cartService.getCart(SESSION)).items).toEqual([]);
  });

  it('remove_from_cart removes an item by id', async () => {
    await cartService.addItem(SESSION, burgerId, 2, burgerCustomizations);
    const res = await dispatchTool(
      { id: 'tu_9', name: 'remove_from_cart', input: { itemId: burgerId } },
      { sessionId: SESSION },
    );
    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.mutated).toBe(true);
    expect((await cartService.getCart(SESSION)).items).toEqual([]);
  });

  it('remove_from_cart prefers cartItemId and removes one cart line', async () => {
    await cartService.addItem(SESSION, burgerId, 1, burgerCustomizations);
    await cartService.addItem(SESSION, burgerId, 2, burgerBlueCheeseCustomizations);
    const before = await cartService.getCart(SESSION);
    const lineToRemove = before.items.find((item) => item.customizations.length === 2)!;

    const res = await dispatchTool(
      {
        id: 'tu_cart_line',
        name: 'remove_from_cart',
        input: { itemId: burgerId, cartItemId: lineToRemove.id },
      },
      { sessionId: SESSION },
    );

    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.mutated).toBe(true);
    const cart = await cartService.getCart(SESSION);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.id).not.toBe(lineToRemove.id);
    expect(cart.items[0]!.menuItemId).toBe(burgerId);
  });

  it('remove_from_cart returns recoverable ambiguity error for shared menuItemId', async () => {
    await cartService.addItem(SESSION, burgerId, 1, burgerCustomizations);
    await cartService.addItem(SESSION, burgerId, 2, burgerBlueCheeseCustomizations);

    const res = await dispatchTool(
      {
        id: 'tu_ambiguous_remove',
        name: 'remove_from_cart',
        input: { itemId: burgerId },
      },
      { sessionId: SESSION },
    );

    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    expect(res.is_error).toBe(true);
    expect(res.mutated).toBe(false);
    const parsed = JSON.parse(res.content) as { error: string; message: string };
    expect(parsed.error).toBe('AMBIGUOUS_CART_ITEM');
    expect(parsed.message).toContain('Wagyu Beef Burger');
    expect((await cartService.getCart(SESSION)).items).toHaveLength(2);
  });

  it('modify_item prefers cartItemId over itemId', async () => {
    await cartService.addItem(SESSION, burgerId, 1, burgerCustomizations);
    await cartService.addItem(SESSION, burgerId, 2, burgerBlueCheeseCustomizations);
    const before = await cartService.getCart(SESSION);
    const lineToModify = before.items.find((item) => item.customizations.length === 2)!;

    const res = await dispatchTool(
      {
        id: 'tu_cart_line_modify',
        name: 'modify_item',
        input: { itemId: burgerId, cartItemId: lineToModify.id, newQuantity: 5 },
      },
      { sessionId: SESSION },
    );

    expect(res.type).toBe('tool_result');
    if (res.type !== 'tool_result') throw new Error('unreachable');
    const cart = await cartService.getCart(SESSION);
    expect(cart.items.find((item) => item.id === lineToModify.id)?.quantity).toBe(5);
    expect(cart.items.find((item) => item.id !== lineToModify.id)?.quantity).toBe(1);
  });
});
