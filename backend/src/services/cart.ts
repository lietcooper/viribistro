// Persistent cart store. Authenticated carts are keyed by userId; guest carts
// fall back to sessionId. REST and chat tools share this service.
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/AppError.js';

export interface CartOwner {
  sessionId: string;
  userId?: string | null;
}

type CartLookup = { userId: string } | { sessionId: string };
type CartOwnerInput = string | CartOwner;

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

function owner(input: CartOwnerInput): CartOwner {
  return typeof input === 'string' ? { sessionId: input, userId: null } : input;
}

function lookup(input: CartOwnerInput): CartLookup {
  const o = owner(input);
  return o.userId ? { userId: o.userId } : { sessionId: o.sessionId };
}

export function cartOwnerKey(input: CartOwnerInput): string {
  const o = owner(input);
  return o.userId ? `user:${o.userId}` : `session:${o.sessionId}`;
}

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

async function readItems(ownerInput: CartOwnerInput): Promise<DbCartItem[]> {
  const row = await prisma.cart.findUnique({
    where: lookup(ownerInput),
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

async function ensureCart(ownerInput: CartOwnerInput): Promise<{ id: string }> {
  const o = owner(ownerInput);
  const where = lookup(o);
  return prisma.cart.upsert({
    where,
    update: {},
    create: o.userId ? { userId: o.userId } : { sessionId: o.sessionId },
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
    throw new AppError(
      400,
      'UNAVAILABLE_MENU_ITEM',
      `Menu item is not currently available: ${item.name}`,
    );
  }
  return item;
}

export async function getCart(ownerInput: CartOwnerInput): Promise<Cart> {
  return serialize(await readItems(ownerInput));
}

export async function clearCart(ownerInput: CartOwnerInput): Promise<Cart> {
  await prisma.cart.deleteMany({ where: lookup(ownerInput) });
  return { items: [], total: '0.00' };
}

export async function addItem(
  ownerInput: CartOwnerInput,
  menuItemId: string,
  quantity: number,
): Promise<Cart> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a positive integer');
  }
  const item = await lookupMenuItem(menuItemId);
  const cart = await ensureCart(ownerInput);

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

  return getCart(ownerInput);
}

export async function modifyItem(
  ownerInput: CartOwnerInput,
  menuItemId: string,
  newQuantity: number,
): Promise<Cart> {
  if (!Number.isInteger(newQuantity) || newQuantity < 0) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a non-negative integer');
  }

  const existingCart = await prisma.cart.findUnique({
    where: lookup(ownerInput),
    select: { id: true },
  });

  if (newQuantity === 0) {
    if (existingCart) {
      await prisma.cartItem.deleteMany({
        where: { cartId: existingCart.id, menuItemId },
      });
    }
    return getCart(ownerInput);
  }

  const item = await lookupMenuItem(menuItemId);
  const cart = existingCart ?? (await ensureCart(ownerInput));
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

  return getCart(ownerInput);
}

export async function removeItem(
  ownerInput: CartOwnerInput,
  menuItemId: string,
): Promise<Cart> {
  const existingCart = await prisma.cart.findUnique({
    where: lookup(ownerInput),
    select: { id: true },
  });
  if (!existingCart) return { items: [], total: '0.00' };

  await prisma.cartItem.deleteMany({
    where: { cartId: existingCart.id, menuItemId },
  });
  return getCart(ownerInput);
}
