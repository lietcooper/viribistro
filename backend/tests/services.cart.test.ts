import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { resetDb } from './helpers/resetDb.js';
import { seedMenu } from '../prisma/seed.js';
import * as cartService from '../src/services/cart.js';
import { normalizePrice } from '../src/services/cart.js';

describe('cart service', () => {
  let burger: { id: string; price: string };
  let salmon: { id: string; price: string };
  let burgerGroups: {
    temperature: { id: string; mediumRare: string };
    cheese: { id: string; blue: string };
  };

  beforeAll(async () => {
    await resetDb();
    await seedMenu(prisma);
    const items = await prisma.menuItem.findMany();
    const b = items.find((i) => i.name === 'Wagyu Beef Burger');
    const s = items.find((i) => i.name === 'Pan-Seared Salmon');
    if (!b || !s) throw new Error('seed missing expected items');
    burger = { id: b.id, price: b.price.toString() };
    salmon = { id: s.id, price: s.price.toString() };
    const groups = await prisma.customizationGroup.findMany({
      where: { menuItemId: b.id },
      include: { options: true },
    });
    const temperature = groups.find((g) => g.name === 'Temperature');
    const cheese = groups.find((g) => g.name === 'Cheese');
    const mediumRare = temperature?.options.find((o) => o.name === 'Medium rare');
    const blue = cheese?.options.find((o) => o.name === 'Blue cheese');
    if (!temperature || !cheese || !mediumRare || !blue) {
      throw new Error('seed missing burger customizations');
    }
    burgerGroups = {
      temperature: { id: temperature.id, mediumRare: mediumRare.id },
      cheese: { id: cheese.id, blue: blue.id },
    };
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cartService.clearCart('session-a');
    await cartService.clearCart('session-b');
  });

  function burgerBaseCustomizations(): Record<string, string[]> {
    return { [burgerGroups.temperature.id]: [burgerGroups.temperature.mediumRare] };
  }

  it('addItem adds an item to an empty cart', async () => {
    await cartService.addItem('session-a', burger.id, 1, burgerBaseCustomizations());
    const cart = await cartService.getCart('session-a');
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.menuItemId).toBe(burger.id);
    expect(cart.items[0]!.quantity).toBe(1);
    // unitPrice is normalized at the cart boundary to two decimal places.
    expect(cart.items[0]!.unitPrice).toBe(normalizePrice(burger.price));
    expect(cart.items[0]!.name).toBe('Wagyu Beef Burger');
    // total is always two decimal places, matching the DB Decimal(10,2) shape.
    expect(Number(cart.total)).toBeCloseTo(Number(burger.price), 2);
    expect(cart.total).toMatch(/^\d+\.\d{2}$/);
  });

  it('addItem stacks quantity when the same item is added twice', async () => {
    await cartService.addItem('session-a', burger.id, 1, burgerBaseCustomizations());
    await cartService.addItem('session-a', burger.id, 2, burgerBaseCustomizations());
    const cart = await cartService.getCart('session-a');
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.quantity).toBe(3);
  });

  it('applies customization price deltas and returns normalized choices', async () => {
    await cartService.addItem('session-a', burger.id, 1, {
      [burgerGroups.temperature.id]: [burgerGroups.temperature.mediumRare],
      [burgerGroups.cheese.id]: [burgerGroups.cheese.blue],
    });

    const cart = await cartService.getCart('session-a');
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.id).toBeTruthy();
    expect(cart.items[0]!.customizationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(cart.items[0]!.unitPrice).toBe('29.00');
    expect(cart.items[0]!.customizations).toEqual([
      {
        groupId: burgerGroups.temperature.id,
        groupName: 'Temperature',
        options: [
          {
            optionId: burgerGroups.temperature.mediumRare,
            optionName: 'Medium rare',
            priceDelta: '0.00',
          },
        ],
      },
      {
        groupId: burgerGroups.cheese.id,
        groupName: 'Cheese',
        options: [
          {
            optionId: burgerGroups.cheese.blue,
            optionName: 'Blue cheese',
            priceDelta: '3.00',
          },
        ],
      },
    ]);
  });

  it('stacks identical customized lines and separates different customization hashes', async () => {
    const mediumRareBlue = {
      [burgerGroups.temperature.id]: [burgerGroups.temperature.mediumRare],
      [burgerGroups.cheese.id]: [burgerGroups.cheese.blue],
    };
    await cartService.addItem('session-a', burger.id, 1, mediumRareBlue);
    await cartService.addItem('session-a', burger.id, 2, {
      [burgerGroups.cheese.id]: [burgerGroups.cheese.blue],
      [burgerGroups.temperature.id]: [burgerGroups.temperature.mediumRare],
    });
    await cartService.addItem('session-a', burger.id, 1, {
      [burgerGroups.temperature.id]: [burgerGroups.temperature.mediumRare],
    });

    const cart = await cartService.getCart('session-a');
    expect(cart.items).toHaveLength(2);
    const withCheese = cart.items.find((i) => i.customizations.length === 2);
    const withoutCheese = cart.items.find((i) => i.customizations.length === 1);
    expect(withCheese?.quantity).toBe(3);
    expect(withCheese?.unitPrice).toBe('29.00');
    expect(withoutCheese?.quantity).toBe(1);
    expect(withoutCheese?.unitPrice).toBe('26.00');
    expect(withCheese?.customizationHash).not.toBe(withoutCheese?.customizationHash);
  });

  it('requires selected options for required customization groups', async () => {
    await expect(cartService.addItem('session-a', burger.id, 1)).rejects.toMatchObject({
      code: 'MISSING_REQUIRED_CUSTOMIZATION',
    });
  });

  it('rejects customization options that do not belong to the item group', async () => {
    await expect(
      cartService.addItem('session-a', burger.id, 1, {
        [burgerGroups.temperature.id]: [burgerGroups.cheese.blue],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CUSTOMIZATION_OPTION' });
  });

  it('can modify and remove a specific cart line by cart item id', async () => {
    await cartService.addItem('session-a', burger.id, 1, {
      [burgerGroups.temperature.id]: [burgerGroups.temperature.mediumRare],
      [burgerGroups.cheese.id]: [burgerGroups.cheese.blue],
    });
    const first = (await cartService.getCart('session-a')).items[0]!;

    await cartService.modifyItem('session-a', first.id, 4);
    expect((await cartService.getCart('session-a')).items[0]!.quantity).toBe(4);

    await cartService.removeItem('session-a', first.id);
    expect((await cartService.getCart('session-a')).items).toEqual([]);
  });

  it('addItem does not retroactively mutate a snapshot returned by getCart', async () => {
    // The previous implementation mutated the Map entry in place, so any
    // reference handed out by an earlier getCart() call would silently
    // grow its quantity after a subsequent addItem(). Defensive copy fix.
    await cartService.addItem('session-a', burger.id, 1, burgerBaseCustomizations());
    const frozenSnapshot = await cartService.getCart('session-a');
    const firstQuantity = frozenSnapshot.items[0]!.quantity;
    await cartService.addItem('session-a', burger.id, 4, burgerBaseCustomizations());
    // Snapshot must still reflect the moment it was taken.
    expect(frozenSnapshot.items[0]!.quantity).toBe(firstQuantity);
    // Fresh fetch sees the new total.
    expect((await cartService.getCart('session-a')).items[0]!.quantity).toBe(5);
  });

  it('modifyItem changes quantity', async () => {
    await cartService.addItem('session-a', burger.id, 1, burgerBaseCustomizations());
    await cartService.modifyItem('session-a', burger.id, 5);
    const cart = await cartService.getCart('session-a');
    expect(cart.items[0]!.quantity).toBe(5);
  });

  it('modifyItem with quantity 0 removes the item', async () => {
    await cartService.addItem('session-a', burger.id, 1, burgerBaseCustomizations());
    await cartService.modifyItem('session-a', burger.id, 0);
    expect((await cartService.getCart('session-a')).items).toHaveLength(0);
  });

  it('removeItem deletes an item', async () => {
    await cartService.addItem('session-a', burger.id, 1, burgerBaseCustomizations());
    await cartService.addItem('session-a', salmon.id, 1);
    await cartService.removeItem('session-a', burger.id);
    const cart = await cartService.getCart('session-a');
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.menuItemId).toBe(salmon.id);
  });

  it('clearCart empties everything for a session', async () => {
    await cartService.addItem('session-a', burger.id, 1, burgerBaseCustomizations());
    await cartService.clearCart('session-a');
    expect((await cartService.getCart('session-a')).items).toHaveLength(0);
    // Empty cart total is "0.00" — always two decimal places, matching the
    // Postgres Decimal(10,2) shape used everywhere else.
    expect((await cartService.getCart('session-a')).total).toBe('0.00');
  });

  it('total is always formatted to two decimal places', async () => {
    // A single $26 burger should serialize as "26.00", not "26".
    await cartService.addItem('session-a', burger.id, 1, burgerBaseCustomizations());
    expect((await cartService.getCart('session-a')).total).toMatch(/^\d+\.\d{2}$/);
  });

  describe('normalizePrice', () => {
    it('always returns a two-decimal string', () => {
      expect(normalizePrice('26')).toBe('26.00');
      expect(normalizePrice('26.5')).toBe('26.50');
      expect(normalizePrice('0')).toBe('0.00');
      expect(normalizePrice({ toString: () => '12.345' })).toBe('12.35');
      // Defends against a long-tail value sneaking past Decimal(10,2) —
      // recomputeTotal's slice(0,2) would otherwise silently truncate.
      expect(normalizePrice('99.999')).toBe('100.00');
    });
  });

  it('partitions carts by sessionId', async () => {
    await cartService.addItem('session-a', burger.id, 1, burgerBaseCustomizations());
    await cartService.addItem('session-b', salmon.id, 1);
    expect((await cartService.getCart('session-a')).items[0]!.menuItemId).toBe(burger.id);
    expect((await cartService.getCart('session-b')).items[0]!.menuItemId).toBe(salmon.id);
  });

  it('partitions authenticated carts by userId even with the same sessionId', async () => {
    const userA = await prisma.user.create({
      data: { email: 'cart-user-a@example.com', name: 'Cart User A', provider: 'google' },
    });
    const userB = await prisma.user.create({
      data: { email: 'cart-user-b@example.com', name: 'Cart User B', provider: 'google' },
    });

    await cartService.addItem(
      { sessionId: 'shared-browser', userId: userA.id },
      burger.id,
      1,
      burgerBaseCustomizations(),
    );
    await cartService.addItem({ sessionId: 'shared-browser', userId: userB.id }, salmon.id, 1);

    expect(
      (await cartService.getCart({ sessionId: 'shared-browser', userId: userA.id })).items[0]!
        .menuItemId,
    ).toBe(burger.id);
    expect(
      (await cartService.getCart({ sessionId: 'shared-browser', userId: userB.id })).items[0]!
        .menuItemId,
    ).toBe(salmon.id);
  });

  it('total is the sum of unitPrice * quantity', async () => {
    await cartService.addItem('session-a', burger.id, 2, burgerBaseCustomizations());
    await cartService.addItem('session-a', salmon.id, 1);
    const cart = await cartService.getCart('session-a');
    const expected = Number(burger.price) * 2 + Number(salmon.price);
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
