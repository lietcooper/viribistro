import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';

describe('ScreenContainer', () => {
  it('renders its children', () => {
    render(
      <ScreenContainer>
        <Text>Hello bistro</Text>
      </ScreenContainer>,
    );
    expect(screen.getByText('Hello bistro')).toBeTruthy();
  });

  it('applies a max-width of 480 on the inner column', () => {
    render(
      <ScreenContainer testID="container">
        <Text>Inner</Text>
      </ScreenContainer>,
    );
    const inner = screen.getByTestId('container');
    // Style prop is an object literal; flatten to read maxWidth.
    const style = Array.isArray(inner.props.style) ? inner.props.style[0] : inner.props.style;
    expect(style.maxWidth).toBe(480);
  });
});
