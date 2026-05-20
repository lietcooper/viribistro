// Order persistence. Snapshots prices from the live menu at confirmation
// time and writes Order + OrderItem rows in a single transaction so partial
// orders cannot exist.
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/AppError.js';
import * as cart from './cart.js';
import type { CartOwner } from './cart.js';
import { normalizePrice } from './cart.js';

export interface SerializedOrderItem {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: string;
  customizationHash: string;
  customizations: unknown;
  note: string | null;
}

export interface SerializedOrder {
  id: string;
  // null for guest (unauthenticated) orders — see routes/orders.ts.
  userId: string | null;
  status: 'pending' | 'confirmed';
  totalPrice: string;
  createdAt: string;
  items: SerializedOrderItem[];
}

function serializeOrder(order: {
  id: string;
  userId: string | null;
  status: 'pending' | 'confirmed';
  totalPrice: { toString: () => string };
  createdAt: Date;
  items: {
    id: string;
    menuItemId: string;
    quantity: number;
    unitPrice: { toString: () => string };
    customizationHash: string;
    customizations: unknown;
    note: string | null;
  }[];
}): SerializedOrder {
  return {
    id: order.id,
    userId: order.userId,
    status: order.status,
    totalPrice: order.totalPrice.toString(),
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((it) => ({
      id: it.id,
      menuItemId: it.menuItemId,
      quantity: it.quantity,
      unitPrice: normalizePrice(it.unitPrice),
      customizationHash: it.customizationHash,
      customizations: it.customizations,
      note: it.note,
    })),
  };
}

// Per-session in-flight gate. Two concurrent POST /api/orders requests for
// the same sessionId could both read the same persisted cart before either
// clears it, creating duplicate orders. Serialize at the call site.
// NOTE: this Set is single-process only — multi-instance deploys (e.g. Railway
// horizontal scaling) won't see each other's locks, so duplicate-order
// prevention degrades to best-effort. For now we run a single instance; a
// DB-level idempotency key on Order is the proper fix when we scale out.
const inFlightConfirmations: Set<string> = new Set();

/**
 * Confirm a cart into a persisted Order. Snapshots the cart's `unitPrice` as
 * captured at add-to-cart time — the standard "price at time of order" model
 * — but re-validates that every menu item still exists and is still available
 * inside the transaction before writing OrderItems.
 */
export async function confirmCart(owner: CartOwner): Promise<SerializedOrder> {
  const key = cart.cartOwnerKey(owner);
  if (inFlightConfirmations.has(key)) {
    throw new AppError(
      409,
      'ORDER_IN_PROGRESS',
      'An order for this session is already being confirmed',
    );
  }
  inFlightConfirmations.add(key);
  try {
    return await confirmCartInner(owner);
  } finally {
    // ALWAYS release: even on success, even on failure, even on AppError.
    // Otherwise the session would be permanently locked out of ordering.
    inFlightConfirmations.delete(key);
  }
}

async function confirmCartInner(owner: CartOwner): Promise<SerializedOrder> {
  const current = await cart.getCart(owner);
  if (current.items.length === 0) {
    throw new AppError(400, 'CART_EMPTY', 'Cart is empty');
  }

  const persisted = await prisma.$transaction(async (tx) => {
    // Confirm referenced menu items still exist and are orderable.
    const menuItemIds = [...new Set(current.items.map((i) => i.menuItemId))];
    const menuItems = await tx.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      select: { id: true, price: true, available: true },
    });
    if (menuItems.length !== menuItemIds.length) {
      throw new AppError(400, 'UNKNOWN_MENU_ITEM', 'One or more cart items no longer exist');
    }
    const unavailable = menuItems.find((m) => !m.available);
    if (unavailable) {
      throw new AppError(
        409,
        'ITEM_UNAVAILABLE',
        `Item ${unavailable.id} is no longer available`,
      );
    }

    // total = sum(unitPrice * quantity) using Prisma Decimal arithmetic.
    let total = new Prisma.Decimal(0);
    const itemRows: Prisma.OrderItemCreateManyOrderInput[] = current.items.map((ci) => {
      const unitPrice = new Prisma.Decimal(ci.unitPrice);
      total = total.add(unitPrice.mul(ci.quantity));
      return {
        menuItemId: ci.menuItemId,
        quantity: ci.quantity,
        unitPrice,
        customizationHash: ci.customizationHash,
        customizations: ci.customizations as unknown as Prisma.InputJsonValue,
        note: ci.note,
      };
    });

    const order = await tx.order.create({
      data: {
        userId: owner.userId ?? null,
        status: 'confirmed',
        totalPrice: total,
        items: { createMany: { data: itemRows } },
      },
      include: { items: true },
    });
    return order;
  });

  // Clear cart only after the transaction succeeds.
  await cart.clearCart(owner);

  return serializeOrder(persisted);
}

export async function listOrdersForUser(userId: string): Promise<SerializedOrder[]> {
  // userId is required here (GET /api/orders is auth-gated). Guest orders
  // — userId IS NULL — are intentionally never returned by this listing.
  const rows = await prisma.order.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(serializeOrder);
}
