import { renderHook } from '@testing-library/react-native';

import { computeTotal, lineTotal, useCartStore } from '@/stores/useCartStore';
import { useCartTotal } from '@/hooks/useCartTotal';

const burger = { menuItemId: 'm-burger', name: 'Wagyu burger', unitPrice: '24.50' };
const fries = { menuItemId: 'm-fries', name: 'Truffle fries', unitPrice: '9.00' };

const mockClient = {
  post: jest.fn(() => new Promise(() => {})),
  patch: jest.fn(() => new Promise(() => {})),
  delete: jest.fn(() => new Promise(() => {})),
  get: jest.fn(() => new Promise(() => {})),
};

jest.mock('@/lib/api', () => ({
  getApiClient: () => mockClient,
}));

jest.mock('@/lib/session', () => ({
  getSessionId: () => 'test-session',
}));

beforeEach(() => {
  jest.clearAllMocks();
  useCartStore.setState({ items: [], total: '0.00' });
});

describe('useCartStore mutations', () => {
  it('adds a brand-new item with the given quantity', () => {
    useCartStore.getState().addItem(burger, 2);
    const { items, total } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(expect.objectContaining({ ...burger, quantity: 2 }));
    expect(items[0]?.id).toMatch(/^local-m-burger-/);
    expect(total).toBe('49.00');
  });

  it('keeps repeated adds as separate cart lines', () => {
    useCartStore.getState().addItem(burger, 1);
    useCartStore.getState().addItem(burger, 2);
    const { items, total } = useCartStore.getState();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.quantity)).toEqual([1, 2]);
    expect(total).toBe('73.50');
  });

  it('sends customization ids when adding a customized line', () => {
    useCartStore.getState().addItem(
      {
        ...burger,
        unitPrice: '27.50',
        customizations: [
          {
            groupId: 'temp',
            groupName: 'Temperature',
            optionIds: ['medium'],
            optionNames: ['Medium'],
            priceDelta: '3.00',
          },
        ],
      },
      1,
    );
    expect(mockClient.post).toHaveBeenCalledWith('/api/cart', {
      sessionId: 'test-session',
      itemId: 'm-burger',
      menuItemId: 'm-burger',
      quantity: 1,
      customizations: [{ groupId: 'temp', optionIds: ['medium'] }],
    });
  });

  it('removeItem drops the item entirely', () => {
    useCartStore.getState().addItem(burger, 1);
    useCartStore.getState().addItem(fries, 1);
    const burgerLineId = useCartStore.getState().items[0]?.id ?? 'm-burger';
    useCartStore.getState().removeItem(burgerLineId);
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ ...fries, quantity: 1 }),
    ]);
    expect(useCartStore.getState().total).toBe('9.00');
  });

  it('modifyItem updates the quantity', () => {
    useCartStore.getState().addItem(burger, 1);
    const lineId = useCartStore.getState().items[0]?.id ?? 'm-burger';
    useCartStore.getState().modifyItem(lineId, 4);
    expect(useCartStore.getState().items[0]?.quantity).toBe(4);
    expect(useCartStore.getState().total).toBe('98.00');
  });

  it('modifyItem with quantity <= 0 removes the item', () => {
    useCartStore.getState().addItem(burger, 1);
    const lineId = useCartStore.getState().items[0]?.id ?? 'm-burger';
    useCartStore.getState().modifyItem(lineId, 0);
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('clearCart wipes everything', () => {
    useCartStore.getState().addItem(burger, 2);
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toEqual([]);
    expect(useCartStore.getState().total).toBe('0.00');
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
  it('matches the backend Decimal math for fractional prices and pads to two decimals', () => {
    // Whole-dollar totals now come back with two decimal places so the
    // wire format matches the server's reconcile payload.
    expect(
      computeTotal([
        { id: '1', menuItemId: '1', name: 'A', unitPrice: '12.50', quantity: 2 },
        { id: '2', menuItemId: '2', name: 'B', unitPrice: '0.75', quantity: 4 },
      ]),
    ).toBe('28.00');
    expect(
      computeTotal([{ id: '1', menuItemId: '1', name: 'A', unitPrice: '4.99', quantity: 3 }]),
    ).toBe('14.97');
  });
});

describe('lineTotal', () => {
  it('uses integer-cents math so display subtotals match the cart total', () => {
    expect(lineTotal('12.50', 2)).toBe('25.00');
    expect(lineTotal('4.99', 3)).toBe('14.97');
    expect(lineTotal('9.00', 1)).toBe('9.00');
  });

  it('returns 0.00 for non-positive quantities', () => {
    expect(lineTotal('10.00', 0)).toBe('0.00');
    expect(lineTotal('10.00', -1)).toBe('0.00');
  });
});

describe('useCartTotal selector', () => {
  it('reports the running total and item count', () => {
    useCartStore.getState().addItem(burger, 2);
    useCartStore.getState().addItem(fries, 1);
    const { result } = renderHook(() => useCartTotal());
    expect(result.current.total).toBe('58.00');
    expect(result.current.itemCount).toBe(3);
  });
});
