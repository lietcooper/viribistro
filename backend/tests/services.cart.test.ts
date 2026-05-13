import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { resetDb } from './helpers/resetDb.js';
import { seedMenu } from '../prisma/seed.js';
import * as cartService from '../src/services/cart.js';

describe('cart service', () => {
  let burger: { id: string; price: string };
  let salmon: { id: string; price: string };

  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
    const items = await prisma.menuItem.findMany();
    const b = items.find((i) => i.name === 'Wagyu Beef Burger');
    const s = items.find((i) => i.name === 'Pan-Seared Salmon');
    if (!b || !s) throw new Error('seed missing expected items');
    burger = { id: b.id, price: b.price.toString() };
    salmon = { id: s.id, price: s.price.toString() };
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    cartService.clearCart('session-a');
    cartService.clearCart('session-b');
  });

  it('addItem adds an item to an empty cart', async () => {
    await cartService.addItem('session-a', burger.id, 1);
    const cart = cartService.getCart('session-a');
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.menuItemId).toBe(burger.id);
    expect(cart.items[0]!.quantity).toBe(1);
    expect(cart.items[0]!.unitPrice).toBe(burger.price);
    expect(cart.items[0]!.name).toBe('Wagyu Beef Burger');
    expect(cart.total).toBe(burger.price);
  });

  it('addItem stacks quantity when the same item is added twice', async () => {
    await cartService.addItem('session-a', burger.id, 1);
    await cartService.addItem('session-a', burger.id, 2);
    const cart = cartService.getCart('session-a');
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.quantity).toBe(3);
  });

  it('modifyItem changes quantity', async () => {
    await cartService.addItem('session-a', burger.id, 1);
    await cartService.modifyItem('session-a', burger.id, 5);
    const cart = cartService.getCart('session-a');
    expect(cart.items[0]!.quantity).toBe(5);
  });

  it('modifyItem with quantity 0 removes the item', async () => {
    await cartService.addItem('session-a', burger.id, 1);
    await cartService.modifyItem('session-a', burger.id, 0);
    expect(cartService.getCart('session-a').items).toHaveLength(0);
  });

  it('removeItem deletes an item', async () => {
    await cartService.addItem('session-a', burger.id, 1);
    await cartService.addItem('session-a', salmon.id, 1);
    cartService.removeItem('session-a', burger.id);
    const cart = cartService.getCart('session-a');
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.menuItemId).toBe(salmon.id);
  });

  it('clearCart empties everything for a session', async () => {
    await cartService.addItem('session-a', burger.id, 1);
    cartService.clearCart('session-a');
    expect(cartService.getCart('session-a').items).toHaveLength(0);
    expect(cartService.getCart('session-a').total).toBe('0');
  });

  it('partitions carts by sessionId', async () => {
    await cartService.addItem('session-a', burger.id, 1);
    await cartService.addItem('session-b', salmon.id, 1);
    expect(cartService.getCart('session-a').items[0]!.menuItemId).toBe(burger.id);
    expect(cartService.getCart('session-b').items[0]!.menuItemId).toBe(salmon.id);
  });

  it('total is the sum of unitPrice * quantity', async () => {
    await cartService.addItem('session-a', burger.id, 2);
    await cartService.addItem('session-a', salmon.id, 1);
    const cart = cartService.getCart('session-a');
    const expected =
      Number(burger.price) * 2 + Number(salmon.price);
    expect(Number(cart.total)).toBeCloseTo(expected, 2);
  });

  it('addItem throws if menuItemId does not exist', async () => {
    await expect(cartService.addItem('session-a', 'cnotreal', 1)).rejects.toThrow();
  });

  it('addItem throws if menu item is unavailable', async () => {
    // Mark salmon unavailable just for this assertion.
    await prisma.menuItem.update({ where: { id: salmon.id }, data: { available: false } });
    try {
      await expect(cartService.addItem('session-a', salmon.id, 1)).rejects.toThrow();
    } finally {
      await prisma.menuItem.update({ where: { id: salmon.id }, data: { available: true } });
    }
  });
});
