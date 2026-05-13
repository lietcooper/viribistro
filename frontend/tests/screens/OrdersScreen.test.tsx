import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { OrdersScreen } from '@/screens/OrdersScreen';

const mockClient = { get: jest.fn() };

jest.mock('@/lib/api', () => ({
  getApiClient: () => mockClient,
}));

const FAKE_MENU = {
  items: [
    {
      id: 'mi_burger',
      name: 'Wagyu Burger',
      description: '',
      price: '24.00',
      category: 'mains',
      tags: [],
      imageUrl: '',
      available: true,
    },
    {
      id: 'mi_tartare',
      name: 'Tuna Tartare',
      description: '',
      price: '14.00',
      category: 'starters',
      tags: [],
      imageUrl: '',
      available: true,
    },
  ],
};

const FAKE_ORDERS = {
  orders: [
    {
      id: 'o_1',
      status: 'confirmed',
      totalPrice: '52.00',
      createdAt: '2026-05-12T10:00:00.000Z',
      items: [
        {
          id: 'oi_1',
          menuItemId: 'mi_burger',
          quantity: 2,
          unitPrice: '24.00',
        },
        {
          id: 'oi_2',
          menuItemId: 'mi_tartare',
          quantity: 1,
          unitPrice: '14.00',
        },
      ],
    },
  ],
};

function primeMocks() {
  mockClient.get.mockImplementation((url: string) => {
    if (url === '/api/orders') return Promise.resolve({ data: FAKE_ORDERS });
    if (url === '/api/menu') return Promise.resolve({ data: FAKE_MENU });
    return Promise.reject(new Error(`unmocked ${url}`));
  });
}

beforeEach(() => {
  mockClient.get.mockReset();
});

describe('OrdersScreen', () => {
  it('lists past orders with menu names joined in', async () => {
    primeMocks();
    render(<OrdersScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('orders-list')).toBeTruthy(),
    );

    expect(
      screen.getByText('2 × Wagyu Burger, 1 × Tuna Tartare'),
    ).toBeTruthy();
    expect(screen.getByText('$52.00')).toBeTruthy();
  });

  it('expands the row to show the full breakdown when tapped', async () => {
    primeMocks();
    render(<OrdersScreen />);
    await waitFor(() => screen.getByTestId('order-card-o_1'));

    fireEvent.press(screen.getByTestId('order-card-o_1'));
    expect(screen.getByTestId('order-detail-o_1')).toBeTruthy();
  });

  it('renders the empty state when there are no orders', async () => {
    mockClient.get.mockImplementation((url: string) => {
      if (url === '/api/orders') return Promise.resolve({ data: { orders: [] } });
      if (url === '/api/menu') return Promise.resolve({ data: FAKE_MENU });
      return Promise.reject(new Error('unmocked'));
    });
    render(<OrdersScreen />);
    await waitFor(() => screen.getByTestId('orders-empty'));
  });

  it('renders an auth-aware error when the orders endpoint 401s', async () => {
    const err = new Error('unauth') as Error & {
      response: { status: number };
    };
    err.response = { status: 401 };
    mockClient.get.mockImplementation((url: string) => {
      if (url === '/api/orders') return Promise.reject(err);
      if (url === '/api/menu') return Promise.resolve({ data: FAKE_MENU });
      return Promise.reject(new Error('unmocked'));
    });
    render(<OrdersScreen />);
    await waitFor(() => screen.getByTestId('orders-error'));
    expect(screen.getByText(/sign in/i)).toBeTruthy();
  });
});
