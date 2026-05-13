import { fireEvent, render, screen } from '@testing-library/react-native';

import { MenuItemModal } from '@/components/MenuItemModal';
import { useCartStore } from '@/stores/useCartStore';
import type { MenuItem } from '@/types/api';

const burger: MenuItem = {
  id: 'mi_burger',
  name: 'Wagyu Burger',
  description: 'Dry-aged patty, smoked aioli, brioche bun.',
  price: '24.00',
  category: 'mains',
  tags: [],
  imageUrl: 'https://example.com/burger.jpg',
  available: true,
};

const tartare: MenuItem = {
  id: 'mi_tartare',
  name: 'Tuna Tartare',
  description: 'Sushi-grade ahi, avocado, sesame.',
  price: '14.00',
  category: 'starters',
  tags: [],
  imageUrl: 'https://example.com/tartare.jpg',
  available: true,
};

beforeEach(() => {
  useCartStore.setState({ items: [], total: '0.00' });
});

describe('MenuItemModal', () => {
  it('renders the modal contents for the supplied item', () => {
    render(<MenuItemModal item={burger} onClose={jest.fn()} />);
    expect(screen.getByText('Wagyu Burger')).toBeTruthy();
    expect(screen.getByText('$24.00')).toBeTruthy();
  });

  it('increment / decrement controls update the visible quantity and clamp at 1', () => {
    render(<MenuItemModal item={burger} onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('menu-item-modal-increment'));
    fireEvent.press(screen.getByTestId('menu-item-modal-increment'));
    expect(screen.getByText('Add 3 to cart')).toBeTruthy();
    // Decrement past 1 should clamp.
    fireEvent.press(screen.getByTestId('menu-item-modal-decrement'));
    fireEvent.press(screen.getByTestId('menu-item-modal-decrement'));
    fireEvent.press(screen.getByTestId('menu-item-modal-decrement'));
    fireEvent.press(screen.getByTestId('menu-item-modal-decrement'));
    expect(screen.getByText('Add 1 to cart')).toBeTruthy();
  });

  it('Add CTA pushes the chosen quantity into the cart and closes', () => {
    const onClose = jest.fn();
    render(<MenuItemModal item={burger} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('menu-item-modal-increment'));
    fireEvent.press(screen.getByTestId('menu-item-modal-add'));
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(2);
    expect(onClose).toHaveBeenCalled();
  });

  // Regression test for the Critical bug fix in task #21: RN Modal keeps
  // children mounted, so a one-shot useState(1) leaked the previous
  // item's quantity into the next one. With the useEffect reset keyed
  // on item id, swapping the item must reset the displayed quantity.
  it('resets quantity to 1 when the displayed item changes', () => {
    const onClose = jest.fn();
    const { rerender } = render(
      <MenuItemModal item={burger} onClose={onClose} />,
    );
    fireEvent.press(screen.getByTestId('menu-item-modal-increment'));
    fireEvent.press(screen.getByTestId('menu-item-modal-increment'));
    expect(screen.getByText('Add 3 to cart')).toBeTruthy();

    rerender(<MenuItemModal item={tartare} onClose={onClose} />);
    expect(screen.getByText('Add 1 to cart')).toBeTruthy();
  });

  it('renders nothing when item is null', () => {
    render(<MenuItemModal item={null} onClose={jest.fn()} />);
    expect(screen.queryByTestId('menu-item-modal')).toBeNull();
  });
});
