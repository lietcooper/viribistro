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
  customizationGroups: [
    {
      id: 'temp',
      name: 'Temperature',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: 'rare', name: 'Rare', priceDelta: '0.00', available: true },
        { id: 'medium', name: 'Medium', priceDelta: '2.00', available: true },
        { id: 'sold-out', name: 'Chef Cut', priceDelta: '8.00', available: false },
      ],
    },
    {
      id: 'sides',
      name: 'Sides',
      required: false,
      minSelections: 0,
      maxSelections: 2,
      options: [
        { id: 'fries', name: 'Frites', priceDelta: '5.00', available: true },
        { id: 'greens', name: 'Greens', priceDelta: '4.00', available: true },
      ],
    },
  ],
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
  jest.clearAllMocks();
  useCartStore.setState({ items: [], total: '0.00' });
});

describe('MenuItemModal', () => {
  it('renders the modal contents for the supplied item', () => {
    render(<MenuItemModal item={burger} onClose={jest.fn()} />);
    expect(screen.getByText('Wagyu Burger')).toBeTruthy();
    expect(screen.getByText('$24.00')).toBeTruthy();
    expect(screen.getByText('Temperature *')).toBeTruthy();
  });

  it('increment / decrement controls update the visible quantity and clamp at 1', () => {
    render(<MenuItemModal item={burger} onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('customization-option-temp-rare'));
    fireEvent.press(screen.getByTestId('menu-item-modal-increment'));
    fireEvent.press(screen.getByTestId('menu-item-modal-increment'));
    expect(screen.getByText('Add 3 to cart · $72.00')).toBeTruthy();
    // Decrement past 1 should clamp.
    fireEvent.press(screen.getByTestId('menu-item-modal-decrement'));
    fireEvent.press(screen.getByTestId('menu-item-modal-decrement'));
    fireEvent.press(screen.getByTestId('menu-item-modal-decrement'));
    fireEvent.press(screen.getByTestId('menu-item-modal-decrement'));
    expect(screen.getByText('Add 1 to cart · $24.00')).toBeTruthy();
  });

  it('Add CTA pushes the chosen quantity into the cart and closes', () => {
    const onClose = jest.fn();
    render(<MenuItemModal item={burger} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('customization-option-temp-medium'));
    fireEvent.press(screen.getByTestId('customization-option-sides-fries'));
    fireEvent.press(screen.getByTestId('menu-item-modal-increment'));
    fireEvent.press(screen.getByTestId('menu-item-modal-add'));
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(2);
    expect(items[0]?.unitPrice).toBe('31.00');
    expect(items[0]?.customizations).toEqual([
      {
        groupId: 'temp',
        groupName: 'Temperature',
        optionIds: ['medium'],
        optionNames: ['Medium'],
        priceDelta: '2.00',
      },
      {
        groupId: 'sides',
        groupName: 'Sides',
        optionIds: ['fries'],
        optionNames: ['Frites'],
        priceDelta: '5.00',
      },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it('requires mandatory customizations before adding', () => {
    render(<MenuItemModal item={burger} onClose={jest.fn()} />);
    expect(screen.getByTestId('menu-item-modal-validation')).toHaveTextContent(
      'Please choose temperature.',
    );
    fireEvent.press(screen.getByTestId('menu-item-modal-add'));
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('updates live price for option deltas and blocks unavailable options', () => {
    render(<MenuItemModal item={burger} onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('customization-option-temp-medium'));
    expect(screen.getByText('Add 1 to cart · $26.00')).toBeTruthy();
    fireEvent.press(screen.getByTestId('customization-option-sides-fries'));
    expect(screen.getByText('Add 1 to cart · $31.00')).toBeTruthy();
    fireEvent.press(screen.getByTestId('customization-option-temp-sold-out'));
    expect(screen.getByText('Add 1 to cart · $31.00')).toBeTruthy();
  });

  // Regression test for the Critical bug fix in task #21: RN Modal keeps
  // children mounted, so a one-shot useState(1) leaked the previous
  // item's quantity into the next one. With the useEffect reset keyed
  // on item id, swapping the item must reset the displayed quantity.
  it('resets quantity to 1 when the displayed item changes', () => {
    const onClose = jest.fn();
    const { rerender } = render(<MenuItemModal item={burger} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('customization-option-temp-rare'));
    fireEvent.press(screen.getByTestId('menu-item-modal-increment'));
    fireEvent.press(screen.getByTestId('menu-item-modal-increment'));
    expect(screen.getByText('Add 3 to cart · $72.00')).toBeTruthy();

    rerender(<MenuItemModal item={tartare} onClose={onClose} />);
    expect(screen.getByText('Add 1 to cart · $14.00')).toBeTruthy();
  });

  it('renders nothing when item is null', () => {
    render(<MenuItemModal item={null} onClose={jest.fn()} />);
    expect(screen.queryByTestId('menu-item-modal')).toBeNull();
  });

  it('forwards a trimmed kitchen note into the cart store', () => {
    render(<MenuItemModal item={burger} onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('customization-option-temp-medium'));
    fireEvent.changeText(screen.getByTestId('menu-item-modal-note'), '  extra crispy  ');
    fireEvent.press(screen.getByTestId('menu-item-modal-add'));

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.note).toBe('extra crispy');
  });

  it('omits the note when the user leaves the field empty', () => {
    render(<MenuItemModal item={burger} onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('customization-option-temp-medium'));
    fireEvent.changeText(screen.getByTestId('menu-item-modal-note'), '   ');
    fireEvent.press(screen.getByTestId('menu-item-modal-add'));

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.note).toBeNull();
  });

  // Regression: `toggleOption` used to read `group.maxSelections` only,
  // which is undefined for groups coming from the API (Prisma serializes
  // the field as `maxSelect`). Result: every multi-select group silently
  // collapsed to radio mode and the second selection wiped the first.
  it('allows selecting up to maxSelect options for API-shaped groups', () => {
    const itemFromApi: MenuItem = {
      id: 'mi_lemonade',
      name: 'Lemonade',
      description: 'House-made.',
      price: '7.00',
      category: 'drinks',
      tags: [],
      imageUrl: 'https://example.com/lemonade.jpg',
      available: true,
      customizationGroups: [
        {
          id: 'addons',
          name: 'Add-ons',
          required: false,
          minSelect: 0,
          maxSelect: 2,
          options: [
            { id: 'mint', name: 'Extra mint', priceDelta: '0.00', available: true },
            { id: 'strawberry', name: 'Strawberry purée', priceDelta: '2.00', available: true },
            { id: 'lavender', name: 'Lavender syrup', priceDelta: '1.00', available: true },
          ],
        },
      ],
    };

    const onClose = jest.fn();
    render(<MenuItemModal item={itemFromApi} onClose={onClose} />);
    fireEvent.press(screen.getByTestId('customization-option-addons-mint'));
    fireEvent.press(screen.getByTestId('customization-option-addons-strawberry'));
    fireEvent.press(screen.getByTestId('menu-item-modal-add'));

    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.customizations?.[0]?.optionIds).toEqual(['mint', 'strawberry']);
    expect(items[0]?.unitPrice).toBe('9.00');
  });
});
