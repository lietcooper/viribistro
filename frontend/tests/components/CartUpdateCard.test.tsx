import { render, screen } from '@testing-library/react-native';

import { CartUpdateCard } from '@/components/CartUpdateCard';
import type { Cart } from '@/types/api';

const cart: Cart = {
  total: '31.00',
  items: [
    {
      id: 'line-1',
      menuItemId: 'burger',
      name: 'Wagyu Burger',
      quantity: 1,
      unitPrice: '31.00',
      customizations: [
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
      ],
    },
  ],
};

describe('CartUpdateCard', () => {
  it('renders customization details under updated lines', () => {
    render(<CartUpdateCard cart={cart} />);
    expect(screen.getByText('1 × Wagyu Burger')).toBeTruthy();
    expect(screen.getByText('Medium · Frites')).toBeTruthy();
    expect(screen.getAllByText('$31.00')).toHaveLength(2);
  });
});
