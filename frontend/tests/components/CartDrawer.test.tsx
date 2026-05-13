import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { CartDrawer } from '@/components/CartDrawer';
import { useCartStore } from '@/stores/useCartStore';
import { useCartUiStore } from '@/stores/useCartUiStore';

const mockClient = {
  post: jest.fn(),
  patch: jest.fn(() => new Promise(() => {})),
  delete: jest.fn(() => new Promise(() => {})),
  get: jest.fn(() => new Promise(() => {})),
};

jest.mock('@/lib/api', () => ({
  getApiClient: () => mockClient,
}));

jest.mock('@/lib/session', () => ({
  getSessionId: () => 'session-fixed',
}));

beforeEach(() => {
  mockClient.post.mockReset();
  mockClient.patch.mockClear();
  mockClient.delete.mockClear();
  mockClient.get.mockClear();
  useCartStore.setState({ items: [], total: '0' });
  useCartUiStore.setState({ open: false });
});

describe('CartDrawer', () => {
  it('uses spring physics to animate open / closed', () => {
    const withSpringSpy = jest.spyOn(Reanimated, 'withSpring');
    render(<CartDrawer />);

    act(() => {
      useCartUiStore.getState().openDrawer();
    });

    expect(withSpringSpy).toHaveBeenCalled();
    // Linear timing is reserved for the overlay fade; the sheet itself
    // must be spring-based per the design rules.
    const usedSprings = withSpringSpy.mock.calls.map(([_, cfg]) => cfg);
    expect(usedSprings.some((cfg) => typeof cfg === 'object' && cfg && 'damping' in cfg)).toBe(
      true,
    );
    withSpringSpy.mockRestore();
  });

  it('renders the empty-state copy when the cart has no items', () => {
    render(<CartDrawer />);
    act(() => useCartUiStore.getState().openDrawer());
    expect(screen.getByTestId('cart-empty')).toBeTruthy();
  });

  it('quantity controls dispatch modifyItem on the store', () => {
    useCartStore.setState({
      items: [{ menuItemId: 'a', name: 'A', quantity: 2, unitPrice: '5.00' }],
      total: '10',
    });
    render(<CartDrawer />);
    act(() => useCartUiStore.getState().openDrawer());

    fireEvent.press(screen.getByTestId('cart-row-increment-a'));
    expect(useCartStore.getState().items[0]?.quantity).toBe(3);

    fireEvent.press(screen.getByTestId('cart-row-decrement-a'));
    expect(useCartStore.getState().items[0]?.quantity).toBe(2);

    fireEvent.press(screen.getByTestId('cart-row-remove-a'));
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('Clear button is hidden when the cart is empty', () => {
    render(<CartDrawer />);
    act(() => useCartUiStore.getState().openDrawer());
    expect(screen.queryByTestId('cart-clear')).toBeNull();
  });

  it('tapping Clear cart confirms and resets the local + server cart', async () => {
    useCartStore.setState({
      items: [{ menuItemId: 'a', name: 'A', quantity: 2, unitPrice: '5.00' }],
      total: '10',
    });
    mockClient.post.mockResolvedValueOnce({
      data: { cart: { items: [], total: '0.00' } },
    });

    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_t, _m, buttons) => {
        const ok = (buttons ?? []).find((b) => b.style === 'destructive');
        ok?.onPress?.();
      });

    render(<CartDrawer />);
    act(() => useCartUiStore.getState().openDrawer());

    await act(async () => {
      fireEvent.press(screen.getByTestId('cart-clear'));
    });

    expect(useCartStore.getState().items).toEqual([]);
    expect(mockClient.post).toHaveBeenCalledWith('/api/cart/reset', {
      sessionId: 'session-fixed',
    });
    alertSpy.mockRestore();
  });

  it('checkout POSTs /api/orders, clears the cart, and fires onOrderPlaced', async () => {
    useCartStore.setState({
      items: [{ menuItemId: 'a', name: 'A', quantity: 1, unitPrice: '5.00' }],
      total: '5',
    });
    mockClient.post
      .mockResolvedValueOnce({ data: { order: { id: 'o1' } } })
      .mockResolvedValueOnce({ data: { cart: { items: [], total: '0.00' } } });
    const onOrderPlaced = jest.fn();

    render(<CartDrawer onOrderPlaced={onOrderPlaced} />);
    act(() => useCartUiStore.getState().openDrawer());

    await act(async () => {
      fireEvent.press(screen.getByTestId('cart-checkout'));
    });

    await waitFor(() => {
      expect(mockClient.post).toHaveBeenCalledWith('/api/orders', {
        sessionId: 'session-fixed',
      });
      expect(useCartStore.getState().items).toEqual([]);
      expect(useCartUiStore.getState().open).toBe(false);
      expect(onOrderPlaced).toHaveBeenCalledTimes(1);
    });
  });
});
