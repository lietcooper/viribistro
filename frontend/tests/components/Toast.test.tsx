import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { Toast } from '@/components/Toast';
import { useToastStore } from '@/stores/useToastStore';

beforeEach(() => {
  useToastStore.setState({ visible: false, message: '', tone: 'info', shownAt: 0 });
});

describe('Toast', () => {
  it('renders nothing until the store is poked', () => {
    render(<Toast />);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('renders the most recent message after show()', () => {
    render(<Toast />);
    act(() => {
      useToastStore.getState().show('hello world', 'success');
    });
    expect(screen.getByTestId('toast')).toBeTruthy();
    expect(screen.getByText('hello world')).toBeTruthy();
  });

  it('hide() removes the toast after the exit animation completes', () => {
    jest.useFakeTimers();
    try {
      render(<Toast />);
      act(() => {
        useToastStore.getState().show('boom', 'error');
      });
      expect(screen.getByTestId('toast')).toBeTruthy();

      act(() => {
        fireEvent.press(screen.getByTestId('toast'));
      });
      // Still mounted while the slide-out / fade plays — see the
      // `mounted` lag in Toast.tsx. Without this, exit animation would
      // never be visible.
      expect(screen.queryByTestId('toast')).not.toBeNull();

      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(screen.queryByTestId('toast')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
