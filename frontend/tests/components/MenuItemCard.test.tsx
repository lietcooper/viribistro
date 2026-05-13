import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { MenuItemCard } from '@/components/MenuItemCard';
import { useCartStore } from '@/stores/useCartStore';
import type { MenuItem } from '@/types/api';

const item: MenuItem = {
  id: 'mi_burger',
  name: 'Wagyu Burger',
  description: 'Dry-aged patty, smoked aioli, brioche bun.',
  price: '24.00',
  category: 'mains',
  tags: ['signature'],
  imageUrl: 'https://example.com/burger.jpg',
  available: true,
};

beforeEach(() => {
  useCartStore.setState({ items: [], total: '0.00' });
});

describe('MenuItemCard', () => {
  it('renders the name, formatted price, and primary tag', () => {
    const onPress = jest.fn();
    render(<MenuItemCard item={item} index={0} onPress={onPress} />);
    expect(screen.getByText('Wagyu Burger')).toBeTruthy();
    expect(screen.getByText('$24.00')).toBeTruthy();
    expect(screen.getByText('signature')).toBeTruthy();
  });

  it('tapping the body invokes onPress', () => {
    const onPress = jest.fn();
    render(<MenuItemCard item={item} index={0} onPress={onPress} />);
    fireEvent.press(screen.getByTestId(`menu-card-${item.id}`));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('add button enqueues a scale-pop spring and pushes the item into the cart', () => {
    const sequenceSpy = jest.spyOn(Reanimated, 'withSequence');
    render(<MenuItemCard item={item} index={0} onPress={() => undefined} />);
    fireEvent.press(screen.getByTestId(`menu-add-${item.id}`));
    expect(sequenceSpy).toHaveBeenCalled(); // scale-pop sequence
    const cart = useCartStore.getState().items;
    expect(cart).toHaveLength(1);
    expect(cart[0]?.menuItemId).toBe('mi_burger');
    expect(cart[0]?.quantity).toBe(1);
  });
});
