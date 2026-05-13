import { fireEvent, render, screen } from '@testing-library/react-native';

import { PrimaryButton } from '@/components/PrimaryButton';

describe('PrimaryButton', () => {
  it('renders the label and fires onPress when tapped', () => {
    const onPress = jest.fn();
    render(<PrimaryButton label="Place Order" onPress={onPress} />);
    fireEvent.press(screen.getByText('Place Order'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    render(<PrimaryButton label="Disabled" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner instead of the label while loading', () => {
    render(<PrimaryButton label="Submit" onPress={() => undefined} loading />);
    expect(screen.queryByText('Submit')).toBeNull();
  });
});
