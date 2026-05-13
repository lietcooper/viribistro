import { fireEvent, render, screen } from '@testing-library/react-native';

import { CartItem } from '@/components/CartItem';
import { useCartStore } from '@/stores/useCartStore';

// react-native-gesture-handler's Swipeable wraps its children; we exercise
// the always-visible quantity stepper and trash button rather than the
// swipe gesture itself (that depends on layout + native gesture state).

const burger = {
  menuItemId: 'm-burger',
  name: 'Wagyu burger',
  unitPrice: '24.50',
  quantity: 2,
};

const mockClient = {
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
  useCartStore.setState({ items: [{ ...burger }], total: '49.00' });
});

describe('CartItem', () => {
  it('renders the item name, per-unit price, and current quantity', () => {
    render(<CartItem item={burger} />);
    expect(screen.getByText('Wagyu burger')).toBeTruthy();
    expect(screen.getByText('$24.50 each')).toBeTruthy();
    expect(screen.getByTestId('cart-row-qty-m-burger')).toHaveTextContent('2');
  });

  it('increment button bumps the quantity in the store', () => {
    render(<CartItem item={burger} />);
    fireEvent.press(screen.getByTestId('cart-row-increment-m-burger'));
    expect(useCartStore.getState().items[0]?.quantity).toBe(3);
  });

  it('decrement button reduces the quantity in the store', () => {
    render(<CartItem item={burger} />);
    fireEvent.press(screen.getByTestId('cart-row-decrement-m-burger'));
    expect(useCartStore.getState().items[0]?.quantity).toBe(1);
  });

  it('remove button drops the item entirely', () => {
    render(<CartItem item={burger} />);
    fireEvent.press(screen.getByTestId('cart-row-remove-m-burger'));
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('stepper and remove controls expose accessible labels', () => {
    render(<CartItem item={burger} />);
    expect(
      screen.getByLabelText('Increase quantity of Wagyu burger'),
    ).toBeTruthy();
    expect(
      screen.getByLabelText('Decrease quantity of Wagyu burger'),
    ).toBeTruthy();
    // Both the inline trash button and the swipe-action trash button
    // carry the same remove label.
    expect(screen.getAllByLabelText('Remove Wagyu burger from cart').length).toBeGreaterThanOrEqual(1);
  });
});
