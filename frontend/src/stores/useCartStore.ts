// Cart store. Two paths into this state:
//   1. Direct UI mutations — "Add" on a MenuCard, +/− on a cart row.
//      These update the store immediately so the UI feels responsive.
//   2. Chat-driven mutations — the agent calls `add_to_cart` server-side
//      and POST /api/chat returns the new cart snapshot in `cartUpdate`.
//      We `reconcile()` that snapshot wholesale: server is source of truth.
//
// The store mirrors the backend `Cart` shape so reconciliation is a
// straight assignment. Local mutations recompute the total via the
// integer-cents math from `computeTotal`.
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { getApiClient } from '@/lib/api';
import { getSessionId } from '@/lib/session';
import type { Cart, CartItem } from '@/types/api';

export interface CartState {
  items: CartItem[];
  total: string;
  addItem: (
    item: { menuItemId: string; name: string; unitPrice: string },
    quantity?: number,
  ) => void;
  removeItem: (menuItemId: string) => void;
  modifyItem: (menuItemId: string, newQuantity: number) => void;
  clearCart: () => void;
  hydrateCart: () => Promise<void>;
  reconcile: (cart: Cart) => void;
}

// 2-decimal Postgres Decimal math, mirroring backend services/cart.ts so
// the wire total and the locally-computed total never disagree. Always
// returns two decimal places — whole-dollar totals come back as "33.00",
// not "33", so the format matches the server's reconcile payload.
function priceToCents(price: string): bigint {
  const [intPart, fracPart = ''] = price.split('.');
  return BigInt(intPart ?? '0') * 100n + BigInt((fracPart + '00').slice(0, 2));
}

function centsToDecimal(totalCents: bigint): string {
  const whole = totalCents / 100n;
  const frac = totalCents % 100n;
  return `${whole.toString()}.${frac.toString().padStart(2, '0')}`;
}

export function computeTotal(items: CartItem[]): string {
  let totalCents = 0n;
  for (const item of items) {
    totalCents += priceToCents(item.unitPrice) * BigInt(item.quantity);
  }
  return centsToDecimal(totalCents);
}

/**
 * Per-row subtotal using the same integer-cents math as computeTotal,
 * so price displays never disagree with the cart total. Used by
 * CartUpdateCard and OrdersScreen for line-item displays. Returns a
 * 2-decimal string suitable for formatMoney.
 */
export function lineTotal(unitPrice: string, quantity: number): string {
  if (quantity <= 0) return '0.00';
  return centsToDecimal(priceToCents(unitPrice) * BigInt(quantity));
}

function withTotal(items: CartItem[]) {
  return { items, total: computeTotal(items) };
}

async function refreshServerCart(): Promise<void> {
  const res = await getApiClient().get<{ cart: Cart }>('/api/cart', {
    params: { sessionId: getSessionId() },
  });
  useCartStore.getState().reconcile(res.data.cart);
}

function logSyncFailure(err: unknown): void {
  console.warn('[cart] server sync failed:', err);
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  total: '0.00',

  addItem({ menuItemId, name, unitPrice }, quantity = 1) {
    if (quantity <= 0) return;
    set((state) => {
      const existing = state.items.find((i) => i.menuItemId === menuItemId);
      const nextItems = existing
        ? state.items.map((i) =>
            i.menuItemId === menuItemId ? { ...i, quantity: i.quantity + quantity } : i,
          )
        : [...state.items, { menuItemId, name, unitPrice, quantity }];
      return withTotal(nextItems);
    });
    void getApiClient()
      .post<{ cart: Cart }>('/api/cart', {
        sessionId: getSessionId(),
        menuItemId,
        quantity,
      })
      .then((res) => useCartStore.getState().reconcile(res.data.cart))
      .catch(async (err) => {
        logSyncFailure(err);
        await refreshServerCart().catch(logSyncFailure);
      });
  },

  removeItem(menuItemId) {
    set((state) => withTotal(state.items.filter((i) => i.menuItemId !== menuItemId)));
    void getApiClient()
      .delete<{ cart: Cart }>(`/api/cart/${menuItemId}`, {
        params: { sessionId: getSessionId() },
      })
      .then((res) => useCartStore.getState().reconcile(res.data.cart))
      .catch(async (err) => {
        logSyncFailure(err);
        await refreshServerCart().catch(logSyncFailure);
      });
  },

  modifyItem(menuItemId, newQuantity) {
    set((state) => {
      if (newQuantity <= 0) {
        return withTotal(state.items.filter((i) => i.menuItemId !== menuItemId));
      }
      return withTotal(
        state.items.map((i) =>
          i.menuItemId === menuItemId ? { ...i, quantity: newQuantity } : i,
        ),
      );
    });
    void getApiClient()
      .patch<{ cart: Cart }>('/api/cart', {
        sessionId: getSessionId(),
        menuItemId,
        quantity: Math.max(0, newQuantity),
      })
      .then((res) => useCartStore.getState().reconcile(res.data.cart))
      .catch(async (err) => {
        logSyncFailure(err);
        await refreshServerCart().catch(logSyncFailure);
      });
  },

  clearCart() {
    set({ items: [], total: '0.00' });
    void getApiClient()
      .post<{ cart: Cart }>('/api/cart/reset', { sessionId: getSessionId() })
      .then((res) => useCartStore.getState().reconcile(res.data.cart))
      .catch(logSyncFailure);
  },

  async hydrateCart() {
    await refreshServerCart().catch(logSyncFailure);
  },

  reconcile(cart) {
    // Server is authoritative: copy items + total directly. We don't
    // recompute the total locally so we never disagree with the
    // backend's Decimal math.
    set({ items: cart.items, total: cart.total });
  },
}));

// Selector helper. Exposes the running total + item count so screens
// can subscribe to derived data without recomputing on each render.
//
// Returns a single object via one selector + useShallow so each cart
// mutation only triggers one synchronous render. The previous version
// subscribed to `items` and `total` separately, which caused two
// renders per change and could mis-fire CartBadge's `previous.current`
// spring guard.
export function useCartTotal(): { total: string; itemCount: number } {
  return useCartStore(
    useShallow((s) => ({
      total: s.total,
      itemCount: s.items.reduce((sum, i) => sum + i.quantity, 0),
    })),
  );
}
