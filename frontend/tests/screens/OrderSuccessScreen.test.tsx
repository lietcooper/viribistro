import { act, render, screen } from '@testing-library/react-native';

import { OrderSuccessScreen } from '@/screens/OrderSuccessScreen';

describe('OrderSuccessScreen', () => {
  it('renders the success ring and confirmation copy', () => {
    render(<OrderSuccessScreen />);
    expect(screen.getByTestId('order-success-ring')).toBeTruthy();
    expect(screen.getByText('Order confirmed')).toBeTruthy();
    expect(screen.getByText(/ready in just a moment/)).toBeTruthy();
  });

  it('auto-dismisses after the configured delay', () => {
    jest.useFakeTimers();
    try {
      const onDismiss = jest.fn();
      render(<OrderSuccessScreen onDismiss={onDismiss} autoDismissMs={500} />);
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(499);
      });
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => {
        jest.advanceTimersByTime(2);
      });
      expect(onDismiss).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not schedule an auto-dismiss when autoDismissMs is 0', () => {
    jest.useFakeTimers();
    try {
      const onDismiss = jest.fn();
      render(<OrderSuccessScreen onDismiss={onDismiss} autoDismissMs={0} />);
      act(() => {
        jest.advanceTimersByTime(5_000);
      });
      expect(onDismiss).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('cleans up the auto-dismiss timer on unmount', () => {
    jest.useFakeTimers();
    try {
      const onDismiss = jest.fn();
      const { unmount } = render(
        <OrderSuccessScreen onDismiss={onDismiss} autoDismissMs={500} />,
      );
      unmount();
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      expect(onDismiss).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
