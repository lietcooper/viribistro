// Persistent cart store, keyed by sessionId. REST and chat tools share this
// service so every cart path converges on the same Postgres-backed state.
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/AppError.js';

export interface CartItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: string;
}

export interface Cart {
  items: CartItem[];
  total: string;
}

type DbCartItem = {
  menuItemId: string;
  quantity: number;
  unitPrice: { toString: () => string };
  menuItem: { name: string };
};

export function normalizePrice(price: { toString: () => string }): string {
  return Number(price.toString()).toFixed(2);
}

function recomputeTotal(items: CartItem[]): string {
  let totalCents = 0n;
  for (const item of items) {
    const [intPart, fracPart = ''] = item.unitPrice.split('.');
    const cents = BigInt(intPart!) * 100n + BigInt((fracPart + '00').slice(0, 2));
    totalCents += cents * BigInt(item.quantity);
  }
  const whole = totalCents / 100n;
  const frac = totalCents % 100n;
  return `${whole.toString()}.${frac.toString().padStart(2, '0')}`;
}

function serialize(items: DbCartItem[]): Cart {
  const serialized = items.map((item) => ({
    menuItemId: item.menuItemId,
    name: item.menuItem.name,
    quantity: item.quantity,
    unitPrice: normalizePrice(item.unitPrice),
  }));
  return { items: serialized, total: recomputeTotal(serialized) };
}

async function readItems(sessionId: string): Promise<DbCartItem[]> {
  const row = await prisma.cart.findUnique({
    where: { sessionId },
    select: {
      items: {
        orderBy: { id: 'asc' },
        select: {
          menuItemId: true,
          quantity: true,
          unitPrice: true,
          menuItem: { select: { name: true } },
        },
      },
    },
  });
  return row?.items ?? [];
}

async function ensureCart(sessionId: string): Promise<{ id: string }> {
  return prisma.cart.upsert({
    where: { sessionId },
    update: {},
    create: { sessionId },
    select: { id: true },
  });
}

async function lookupMenuItem(
  menuItemId: string,
): Promise<{ id: string; name: string; price: Prisma.Decimal; available: boolean }> {
  const item = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    select: { id: true, name: true, price: true, available: true },
  });
  if (!item) {
    throw new AppError(400, 'UNKNOWN_MENU_ITEM', `Menu item not found: ${menuItemId}`);
  }
  if (!item.available) {
    throw new AppError(400, 'UNAVAILABLE_MENU_ITEM', `Menu item is not currently available: ${item.name}`);
  }
  return item;
}

export async function getCart(sessionId: string): Promise<Cart> {
  return serialize(await readItems(sessionId));
}

export async function clearCart(sessionId: string): Promise<Cart> {
  await prisma.cart.deleteMany({ where: { sessionId } });
  return { items: [], total: '0.00' };
}

export async function addItem(
  sessionId: string,
  menuItemId: string,
  quantity: number,
): Promise<Cart> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a positive integer');
  }
  const item = await lookupMenuItem(menuItemId);
  const cart = await ensureCart(sessionId);

  await prisma.cartItem.upsert({
    where: { cartId_menuItemId: { cartId: cart.id, menuItemId } },
    update: { quantity: { increment: quantity }, unitPrice: item.price },
    create: {
      cartId: cart.id,
      menuItemId: item.id,
      quantity,
      unitPrice: item.price,
    },
  });

  return getCart(sessionId);
}

export async function modifyItem(
  sessionId: string,
  menuItemId: string,
  newQuantity: number,
): Promise<Cart> {
  if (!Number.isInteger(newQuantity) || newQuantity < 0) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a non-negative integer');
  }

  const existingCart = await prisma.cart.findUnique({
    where: { sessionId },
    select: { id: true },
  });

  if (newQuantity === 0) {
    if (existingCart) {
      await prisma.cartItem.deleteMany({
        where: { cartId: existingCart.id, menuItemId },
      });
    }
    return getCart(sessionId);
  }

  const item = await lookupMenuItem(menuItemId);
  const cart = existingCart ?? (await ensureCart(sessionId));
  await prisma.cartItem.upsert({
    where: { cartId_menuItemId: { cartId: cart.id, menuItemId } },
    update: { quantity: newQuantity, unitPrice: item.price },
    create: {
      cartId: cart.id,
      menuItemId: item.id,
      quantity: newQuantity,
      unitPrice: item.price,
    },
  });

  return getCart(sessionId);
}

export async function removeItem(sessionId: string, menuItemId: string): Promise<Cart> {
  const existingCart = await prisma.cart.findUnique({
    where: { sessionId },
    select: { id: true },
  });
  if (!existingCart) return { items: [], total: '0.00' };

  await prisma.cartItem.deleteMany({
    where: { cartId: existingCart.id, menuItemId },
  });
  return getCart(sessionId);
}
