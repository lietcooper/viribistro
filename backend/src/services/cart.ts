// In-memory cart store, keyed by sessionId. The AI agent's tool dispatcher
// will call these same pure functions, so REST and chat operations converge
// on a single source of truth. State is *intentionally* not persisted —
// only the final Order rows go to the DB (see services/orders.ts).
//
// Decimal math is done with strings so we don't lose precision: every
// MenuItem.price is stored as a Prisma Decimal and we keep prices as their
// canonical toString() value here.
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/AppError.js';

export interface CartItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: string; // serialized Decimal
}

export interface Cart {
  items: CartItem[];
  total: string; // serialized Decimal
}

// Sessions → carts. Reset between tests via clearCart(); never serialized.
const carts: Map<string, CartItem[]> = new Map();

function readableItems(sessionId: string): CartItem[] {
  return carts.get(sessionId) ?? [];
}

// Use 2-decimal rounding consistent with Postgres Decimal(10, 2). Always
// emit two fractional digits so the API contract and system-prompt
// rendering match the DB shape ("26.00" not "26").
function recomputeTotal(items: CartItem[]): string {
  let totalCents = 0n;
  for (const item of items) {
    // Split price into integer + fractional parts in cents.
    const [intPart, fracPart = ''] = item.unitPrice.split('.');
    const cents = BigInt(intPart!) * 100n + BigInt((fracPart + '00').slice(0, 2));
    totalCents += cents * BigInt(item.quantity);
  }
  const whole = totalCents / 100n;
  const frac = totalCents % 100n;
  return `${whole.toString()}.${frac.toString().padStart(2, '0')}`;
}

function snapshot(sessionId: string): Cart {
  const items = readableItems(sessionId);
  return { items: [...items], total: recomputeTotal(items) };
}

export function getCart(sessionId: string): Cart {
  return snapshot(sessionId);
}

export function clearCart(sessionId: string): Cart {
  carts.delete(sessionId);
  return snapshot(sessionId);
}

async function lookupMenuItem(menuItemId: string): Promise<{ id: string; name: string; price: { toString: () => string }; available: boolean }> {
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

export async function addItem(
  sessionId: string,
  menuItemId: string,
  quantity: number,
): Promise<Cart> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a positive integer');
  }
  const item = await lookupMenuItem(menuItemId);
  // Shallow-copy each entry so we never mutate the live Map entry mid-write
  // (the snapshot returned by getCart() handed callers an array containing
  // references to these objects; mutating them in place would silently change
  // the caller's "frozen" view). carts.set is then the single write path.
  const next = readableItems(sessionId).map((i) => ({ ...i }));
  const found = next.find((i) => i.menuItemId === menuItemId);
  if (found) {
    found.quantity += quantity;
  } else {
    next.push({
      menuItemId: item.id,
      name: item.name,
      quantity,
      unitPrice: item.price.toString(),
    });
  }
  carts.set(sessionId, next);
  return snapshot(sessionId);
}

export async function modifyItem(
  sessionId: string,
  menuItemId: string,
  newQuantity: number,
): Promise<Cart> {
  if (!Number.isInteger(newQuantity) || newQuantity < 0) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a non-negative integer');
  }
  // Shallow-copy so we don't mutate the live Map entries (see addItem).
  const next = readableItems(sessionId).map((i) => ({ ...i }));
  const idx = next.findIndex((i) => i.menuItemId === menuItemId);
  if (idx < 0) {
    // If the item isn't in the cart, treat modify-to-positive as add.
    if (newQuantity > 0) {
      await addItem(sessionId, menuItemId, newQuantity);
      return snapshot(sessionId);
    }
    // newQuantity is 0 on a non-existent item — no-op.
    return snapshot(sessionId);
  }
  if (newQuantity === 0) {
    next.splice(idx, 1);
  } else {
    next[idx]!.quantity = newQuantity;
  }
  carts.set(sessionId, next);
  return snapshot(sessionId);
}

export function removeItem(sessionId: string, menuItemId: string): Cart {
  const items = readableItems(sessionId).filter((i) => i.menuItemId !== menuItemId);
  if (items.length === 0) {
    carts.delete(sessionId);
  } else {
    carts.set(sessionId, items);
  }
  return snapshot(sessionId);
}
