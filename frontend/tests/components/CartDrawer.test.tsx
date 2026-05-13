import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { CartDrawer } from '@/components/CartDrawer';
import { useCartStore } from '@/stores/useCartStore';
import { useCartUiStore } from '@/stores/useCartUiStore';

const mockClient = { post: jest.fn() };

jest.mock('@/lib/api', () => ({
  getApiClient: () => mockClient,
}));

jest.mock('@/lib/session', () => ({
  getSessionId: () => 'session-fixed',
}));

beforeEach(() => {
  mockClient.post.mockReset();
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

  it('checkout POSTs /api/orders, clears the cart, and fires onOrderPlaced', async () => {
    useCartStore.setState({
      items: [{ menuItemId: 'a', name: 'A', quantity: 1, unitPrice: '5.00' }],
      total: '5',
    });
    mockClient.post.mockResolvedValueOnce({ data: { order: { id: 'o1' } } });
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
