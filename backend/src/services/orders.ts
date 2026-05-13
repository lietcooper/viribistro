// Order persistence. Snapshots prices from the live menu at confirmation
// time and writes Order + OrderItem rows in a single transaction so partial
// orders cannot exist.
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/AppError.js';
import * as cart from './cart.js';

export interface SerializedOrderItem {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: string;
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
      unitPrice: it.unitPrice.toString(),
    })),
  };
}

// Per-session in-flight gate. Two concurrent POST /api/orders requests for
// the same sessionId could both read the same persisted cart before either
// clears it, creating duplicate orders. Serialize at the call site.
const inFlightConfirmations: Set<string> = new Set();

/**
 * Confirm a cart into a persisted Order. Re-reads each cart item's current
 * price from the DB inside the transaction so a stale in-memory snapshot
 * can't drift past a menu price update.
 */
export async function confirmCart(
  userId: string | null,
  sessionId: string,
): Promise<SerializedOrder> {
  if (inFlightConfirmations.has(sessionId)) {
    throw new AppError(
      409,
      'ORDER_IN_PROGRESS',
      'An order for this session is already being confirmed',
    );
  }
  inFlightConfirmations.add(sessionId);
  try {
    return await confirmCartInner(userId, sessionId);
  } finally {
    // ALWAYS release: even on success, even on failure, even on AppError.
    // Otherwise the session would be permanently locked out of ordering.
    inFlightConfirmations.delete(sessionId);
  }
}

async function confirmCartInner(
  userId: string | null,
  sessionId: string,
): Promise<SerializedOrder> {
  const current = await cart.getCart(sessionId);
  if (current.items.length === 0) {
    throw new AppError(400, 'CART_EMPTY', 'Cart is empty');
  }

  const persisted = await prisma.$transaction(async (tx) => {
    // Authoritative pricing read.
    const menuItems = await tx.menuItem.findMany({
      where: { id: { in: current.items.map((i) => i.menuItemId) } },
      select: { id: true, price: true, available: true },
    });
    if (menuItems.length !== current.items.length) {
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

    const priceById = new Map(menuItems.map((m) => [m.id, m.price] as const));

    // total = sum(unitPrice * quantity) using Prisma Decimal arithmetic.
    let total = new Prisma.Decimal(0);
    const itemRows = current.items.map((ci) => {
      const unitPrice = priceById.get(ci.menuItemId)!;
      total = total.add(unitPrice.mul(ci.quantity));
      return {
        menuItemId: ci.menuItemId,
        quantity: ci.quantity,
        unitPrice,
      };
    });

    const order = await tx.order.create({
      data: {
        userId,
        status: 'confirmed',
        totalPrice: total,
        items: { create: itemRows },
      },
      include: { items: true },
    });
    return order;
  });

  // Clear cart only after the transaction succeeds.
  await cart.clearCart(sessionId);

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
