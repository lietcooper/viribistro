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

import type { Cart, CartItem } from '@/types/api';

export interface CartState {
  items: CartItem[];
  total: string;
  addItem: (item: { menuItemId: string; name: string; unitPrice: string }, quantity?: number) => void;
  removeItem: (menuItemId: string) => void;
  modifyItem: (menuItemId: string, newQuantity: number) => void;
  clearCart: () => void;
  reconcile: (cart: Cart) => void;
}

// 2-decimal Postgres Decimal math, mirroring backend services/cart.ts so
// the wire total and the locally-computed total never disagree.
export function computeTotal(items: CartItem[]): string {
  let totalCents = 0n;
  for (const item of items) {
    const [intPart, fracPart = ''] = item.unitPrice.split('.');
    const cents =
      BigInt(intPart ?? '0') * 100n + BigInt((fracPart + '00').slice(0, 2));
    totalCents += cents * BigInt(item.quantity);
  }
  const whole = totalCents / 100n;
  const frac = totalCents % 100n;
  if (frac === 0n) return whole.toString();
  return `${whole.toString()}.${frac.toString().padStart(2, '0')}`;
}

function withTotal(items: CartItem[]) {
  return { items, total: computeTotal(items) };
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  total: '0',

  addItem({ menuItemId, name, unitPrice }, quantity = 1) {
    if (quantity <= 0) return;
    set((state) => {
      const existing = state.items.find((i) => i.menuItemId === menuItemId);
      const nextItems = existing
        ? state.items.map((i) =>
            i.menuItemId === menuItemId
              ? { ...i, quantity: i.quantity + quantity }
              : i,
          )
        : [...state.items, { menuItemId, name, unitPrice, quantity }];
      return withTotal(nextItems);
    });
  },

  removeItem(menuItemId) {
    set((state) => withTotal(state.items.filter((i) => i.menuItemId !== menuItemId)));
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
  },

  clearCart() {
    set({ items: [], total: '0' });
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
