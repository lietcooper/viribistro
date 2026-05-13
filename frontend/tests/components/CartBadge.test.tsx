import { act, render, screen } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { CartBadge } from '@/components/CartBadge';
import { useCartStore } from '@/stores/useCartStore';

const mockClient = {
  post: jest.fn(() => new Promise(() => {})),
  get: jest.fn(() => new Promise(() => {})),
};

jest.mock('@/lib/api', () => ({
  getApiClient: () => mockClient,
}));

jest.mock('@/lib/session', () => ({
  getSessionId: () => 'test-session',
}));

beforeEach(() => {
  useCartStore.setState({ items: [], total: '0' });
  jest.clearAllMocks();
});

describe('CartBadge', () => {
  it('renders nothing when the cart is empty', () => {
    render(<CartBadge />);
    expect(screen.queryByTestId('cart-badge')).toBeNull();
    expect(screen.getByTestId('cart-badge-hidden')).toBeTruthy();
  });

  it('shows the running count when the cart has items', () => {
    useCartStore.setState({
      items: [
        { menuItemId: 'a', name: 'A', quantity: 2, unitPrice: '5.00' },
        { menuItemId: 'b', name: 'B', quantity: 1, unitPrice: '5.00' },
      ],
      total: '15',
    });
    render(<CartBadge />);
    expect(screen.getByTestId('cart-badge')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('survives the 0→1 transition without a Rules-of-Hooks crash', () => {
    // Regression: useAnimatedStyle used to live after the `itemCount === 0`
    // early return, so the very first add to cart changed the hook count
    // mid-mount and React crashed the entire header subtree (blank page).
    render(<CartBadge />);
    expect(screen.queryByTestId('cart-badge')).toBeNull();

    act(() => {
      useCartStore.setState({
        items: [{ menuItemId: 'a', name: 'A', quantity: 1, unitPrice: '5.00' }],
        total: '5.00',
      });
    });

    expect(screen.getByTestId('cart-badge')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('runs a spring-bounce animation when the count changes', () => {
    const withSpringSpy = jest.spyOn(Reanimated, 'withSpring');
    useCartStore.setState({
      items: [{ menuItemId: 'a', name: 'A', quantity: 1, unitPrice: '5.00' }],
      total: '5',
    });

    render(<CartBadge />);

    act(() => {
      useCartStore.getState().addItem({ menuItemId: 'a', name: 'A', unitPrice: '5.00' }, 1);
    });

    // Two spring calls fire — 1.4x bounce + 1.0 snap-back.
    expect(withSpringSpy).toHaveBeenCalled();
    withSpringSpy.mockRestore();
  });
});
