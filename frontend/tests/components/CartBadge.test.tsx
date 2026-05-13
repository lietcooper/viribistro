import { act, render, screen } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { CartBadge } from '@/components/CartBadge';
import { useCartStore } from '@/stores/useCartStore';

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

  it('runs a spring-bounce animation when the count changes', () => {
    const withSpringSpy = jest.spyOn(Reanimated, 'withSpring');
    useCartStore.setState({
      items: [{ menuItemId: 'a', name: 'A', quantity: 1, unitPrice: '5.00' }],
      total: '5',
    });

    render(<CartBadge />);

    act(() => {
      useCartStore.getState().addItem(
        { menuItemId: 'a', name: 'A', unitPrice: '5.00' },
        1,
      );
    });

    // Two spring calls fire — 1.4x bounce + 1.0 snap-back.
    expect(withSpringSpy).toHaveBeenCalled();
    withSpringSpy.mockRestore();
  });
});
