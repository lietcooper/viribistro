import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { MenuScreen } from '@/screens/MenuScreen';
import { useCartStore } from '@/stores/useCartStore';

const menuItems = [
  {
    id: 'm1',
    name: 'Wagyu Burger',
    description: 'Aged beef, gruyère, brioche.',
    price: '24.00',
    category: 'mains' as const,
    tags: ['signature'],
    imageUrl: 'http://img/wagyu.jpg',
    available: true,
  },
  {
    id: 'm2',
    name: 'Truffle Arancini',
    description: 'Crispy rice balls, truffle aioli.',
    price: '14.00',
    category: 'starters' as const,
    tags: ['vegetarian'],
    imageUrl: 'http://img/arancini.jpg',
    available: true,
  },
  {
    id: 'm3',
    name: 'Spicy Chicken Sandwich',
    description: 'Korean glaze, slaw, pickles.',
    price: '18.00',
    category: 'mains' as const,
    tags: ['spicy'],
    imageUrl: 'http://img/chicken.jpg',
    available: true,
  },
];

const mockClient = { get: jest.fn() };

jest.mock('@/lib/api', () => ({
  getApiClient: () => mockClient,
}));

beforeEach(() => {
  mockClient.get.mockReset();
  mockClient.get.mockResolvedValue({ data: { items: menuItems } });
  useCartStore.setState({ items: [], total: '0' });
});

describe('MenuScreen', () => {
  it('lists every fetched item once /api/menu resolves', async () => {
    render(<MenuScreen />);
    await waitFor(() => {
      expect(screen.getByText('Wagyu Burger')).toBeTruthy();
      expect(screen.getByText('Truffle Arancini')).toBeTruthy();
      expect(screen.getByText('Spicy Chicken Sandwich')).toBeTruthy();
    });
  });

  it('narrows the list to the selected category', async () => {
    render(<MenuScreen />);
    await waitFor(() => screen.getByText('Wagyu Burger'));

    fireEvent.press(screen.getByTestId('filter-starters'));

    expect(screen.queryByText('Wagyu Burger')).toBeNull();
    expect(screen.getByText('Truffle Arancini')).toBeTruthy();
  });

  it('filters by free-text search across name and tags', async () => {
    render(<MenuScreen />);
    await waitFor(() => screen.getByText('Wagyu Burger'));

    fireEvent.changeText(screen.getByTestId('menu-search'), 'spicy');

    expect(screen.queryByText('Wagyu Burger')).toBeNull();
    expect(screen.queryByText('Truffle Arancini')).toBeNull();
    expect(screen.getByText('Spicy Chicken Sandwich')).toBeTruthy();
  });

  it('tapping the inline + button adds the item to the cart store', async () => {
    render(<MenuScreen />);
    await waitFor(() => screen.getByText('Wagyu Burger'));

    fireEvent.press(screen.getByTestId('menu-add-m1'));

    const cart = useCartStore.getState();
    expect(cart.items).toEqual([
      {
        menuItemId: 'm1',
        name: 'Wagyu Burger',
        unitPrice: '24.00',
        quantity: 1,
      },
    ]);
  });

  it('tapping a card opens the modal; "Add" inside the modal adds and closes', async () => {
    render(<MenuScreen />);
    await waitFor(() => screen.getByText('Wagyu Burger'));

    fireEvent.press(screen.getByTestId('menu-card-m1'));
    // Modal renders the same name plus a quantity stepper.
    await waitFor(() => screen.getByTestId('menu-item-modal-add'));
    fireEvent.press(screen.getByTestId('menu-item-modal-increment'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('menu-item-modal-add'));
    });

    expect(useCartStore.getState().items).toEqual([
      {
        menuItemId: 'm1',
        name: 'Wagyu Burger',
        unitPrice: '24.00',
        quantity: 2,
      },
    ]);
  });

  it('shows a friendly error if /api/menu fails', async () => {
    mockClient.get.mockReset();
    mockClient.get.mockRejectedValueOnce(new Error('network down'));
    render(<MenuScreen />);
    await waitFor(() => {
      expect(screen.getByText('Could not load the menu.')).toBeTruthy();
    });
  });
});
