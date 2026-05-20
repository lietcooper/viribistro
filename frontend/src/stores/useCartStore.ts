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
import type {
  Cart,
  CartCustomizationInput,
  CartItem,
  SelectedCustomization,
} from '@/types/api';

export interface AddCartItemInput {
  menuItemId: string;
  name: string;
  unitPrice: string;
  customizations?: SelectedCustomization[];
}

export interface CartState {
  items: CartItem[];
  total: string;
  addItem: (item: AddCartItemInput, quantity?: number) => void;
  removeItem: (lineId: string) => void;
  modifyItem: (lineId: string, newQuantity: number) => void;
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

export function addDecimalPrices(...prices: Array<string | number | undefined>): string {
  return centsToDecimal(
    prices.reduce((sum, price) => {
      if (price === undefined) return sum;
      return sum + priceToCents(String(price));
    }, 0n),
  );
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

let localLineCounter = 0;

function nextLocalLineId(menuItemId: string): string {
  localLineCounter += 1;
  return `local-${menuItemId}-${localLineCounter}`;
}

export function cartLineId(item: Pick<CartItem, 'id' | 'menuItemId'>): string {
  return item.id ?? item.menuItemId;
}

function findLine(item: CartItem, lineId: string): boolean {
  return item.id === lineId || (!item.id && item.menuItemId === lineId);
}

function toCartCustomizationInput(
  customizations: SelectedCustomization[] | undefined,
): CartCustomizationInput {
  return (customizations ?? []).reduce<CartCustomizationInput>((acc, c) => {
    acc[c.groupId] = selectedCustomizationOptionIds(c);
    return acc;
  }, {});
}

export function selectedCustomizationOptionIds(
  customization: SelectedCustomization,
): string[] {
  if (customization.optionIds) return customization.optionIds;
  return customization.options?.map((option) => option.optionId) ?? [];
}

export function selectedCustomizationOptionNames(
  customization: SelectedCustomization,
): string[] {
  if (customization.optionNames) return customization.optionNames;
  return customization.options?.map((option) => option.optionName) ?? [];
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

  addItem({ menuItemId, name, unitPrice, customizations = [] }, quantity = 1) {
    if (quantity <= 0) return;
    set((state) => {
      return withTotal([
        ...state.items,
        {
          id: nextLocalLineId(menuItemId),
          menuItemId,
          name,
          unitPrice,
          quantity,
          customizations,
        },
      ]);
    });
    void getApiClient()
      .post<{ cart: Cart }>('/api/cart', {
        sessionId: getSessionId(),
        itemId: menuItemId,
        menuItemId,
        quantity,
        customizations: toCartCustomizationInput(customizations),
      })
      .then((res) => useCartStore.getState().reconcile(res.data.cart))
      .catch(async (err) => {
        logSyncFailure(err);
        await refreshServerCart().catch(logSyncFailure);
      });
  },

  removeItem(lineId) {
    const line = useCartStore.getState().items.find((i) => findLine(i, lineId));
    set((state) => withTotal(state.items.filter((i) => !findLine(i, lineId))));
    void getApiClient()
      .delete<{ cart: Cart }>(`/api/cart/${lineId}`, {
        params: {
          sessionId: getSessionId(),
          cartItemId: line?.id,
          menuItemId: line?.menuItemId,
        },
        data: {
          sessionId: getSessionId(),
          cartItemId: line?.id,
          menuItemId: line?.menuItemId,
        },
      })
      .then((res) => useCartStore.getState().reconcile(res.data.cart))
      .catch(async (err) => {
        logSyncFailure(err);
        await refreshServerCart().catch(logSyncFailure);
      });
  },

  modifyItem(lineId, newQuantity) {
    const line = useCartStore.getState().items.find((i) => findLine(i, lineId));
    set((state) => {
      if (newQuantity <= 0) {
        return withTotal(state.items.filter((i) => !findLine(i, lineId)));
      }
      return withTotal(
        state.items.map((i) => (findLine(i, lineId) ? { ...i, quantity: newQuantity } : i)),
      );
    });
    void getApiClient()
      .patch<{ cart: Cart }>('/api/cart', {
        sessionId: getSessionId(),
        cartItemId: line?.id,
        id: line?.id,
        menuItemId: line?.menuItemId ?? lineId,
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
