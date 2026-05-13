import { renderHook } from '@testing-library/react-native';

import { computeTotal, useCartStore } from '@/stores/useCartStore';
import { useCartTotal } from '@/hooks/useCartTotal';

const burger = { menuItemId: 'm-burger', name: 'Wagyu burger', unitPrice: '24.50' };
const fries = { menuItemId: 'm-fries', name: 'Truffle fries', unitPrice: '9.00' };

beforeEach(() => {
  useCartStore.setState({ items: [], total: '0' });
});

describe('useCartStore mutations', () => {
  it('adds a brand-new item with the given quantity', () => {
    useCartStore.getState().addItem(burger, 2);
    const { items, total } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ ...burger, quantity: 2 });
    expect(total).toBe('49');
  });

  it('coalesces a second addItem for the same item (no duplicates)', () => {
    useCartStore.getState().addItem(burger, 1);
    useCartStore.getState().addItem(burger, 2);
    const { items, total } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(3);
    expect(total).toBe('73.50');
  });

  it('removeItem drops the item entirely', () => {
    useCartStore.getState().addItem(burger, 1);
    useCartStore.getState().addItem(fries, 1);
    useCartStore.getState().removeItem('m-burger');
    expect(useCartStore.getState().items).toEqual([{ ...fries, quantity: 1 }]);
    expect(useCartStore.getState().total).toBe('9');
  });

  it('modifyItem updates the quantity', () => {
    useCartStore.getState().addItem(burger, 1);
    useCartStore.getState().modifyItem('m-burger', 4);
    expect(useCartStore.getState().items[0]?.quantity).toBe(4);
    expect(useCartStore.getState().total).toBe('98');
  });

  it('modifyItem with quantity <= 0 removes the item', () => {
    useCartStore.getState().addItem(burger, 1);
    useCartStore.getState().modifyItem('m-burger', 0);
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('clearCart wipes everything', () => {
    useCartStore.getState().addItem(burger, 2);
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().total).toBe('0');
  });

  it('reconcile copies the server cart verbatim — including the total', () => {
    useCartStore.getState().addItem(burger, 1);
    useCartStore.getState().reconcile({
      items: [{ ...fries, quantity: 3 }],
      total: '27', // pretend the server is the source of truth, even if local math differs
    });
    expect(useCartStore.getState().items).toEqual([{ ...fries, quantity: 3 }]);
    expect(useCartStore.getState().total).toBe('27');
  });
});

describe('computeTotal', () => {
  it('matches the backend Decimal math for fractional prices', () => {
    expect(
      computeTotal([
        { menuItemId: '1', name: 'A', unitPrice: '12.50', quantity: 2 },
        { menuItemId: '2', name: 'B', unitPrice: '0.75', quantity: 4 },
      ]),
    ).toBe('28');
    expect(
      computeTotal([
        { menuItemId: '1', name: 'A', unitPrice: '4.99', quantity: 3 },
      ]),
    ).toBe('14.97');
  });
});

describe('useCartTotal selector', () => {
  it('reports the running total and item count', () => {
    useCartStore.getState().addItem(burger, 2);
    useCartStore.getState().addItem(fries, 1);
    const { result } = renderHook(() => useCartTotal());
    expect(result.current.total).toBe('58');
    expect(result.current.itemCount).toBe(3);
  });
});
