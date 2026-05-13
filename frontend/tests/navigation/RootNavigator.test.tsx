// Verifies the auth-gating logic in RootNavigator: when the token in
// useAuthStore is null we mount AuthStack; when it's set we mount
// MainTabs. We stub the two stacks so the assertion is about which
// branch was rendered, not about the inner navigators (which need a
// fully-wired NavigationContainer to mount).
import { render, screen } from '@testing-library/react-native';

import { useAuthStore } from '@/stores/useAuthStore';

jest.mock('@/navigation/AuthStack', () => ({
  AuthStack: () => {
    const { Text } = require('react-native');
    return <Text>AUTH_STACK</Text>;
  },
}));

jest.mock('@/navigation/MainTabs', () => ({
  MainTabs: () => {
    const { Text } = require('react-native');
    return <Text>MAIN_TABS</Text>;
  },
}));

// Skip NavigationContainer wiring — it pulls in screen registration we
// don't need for this gating-logic test. NavigationContainer accepts a
// ref in real react-navigation, so the mock uses forwardRef to silence
// the "function components cannot be given refs" warning when
// RootNavigator passes its navRef.
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationContainer: React.forwardRef(
      ({ children }: { children: React.ReactNode }, _ref: unknown) =>
        React.createElement(React.Fragment, null, children),
    ),
    useNavigationContainerRef: () => ({
      isReady: () => false,
      navigate: jest.fn(),
      current: null,
    }),
  };
});

// Skip the bootstrap roundtrip; the navigator should treat us as
// "ready" immediately so the gating logic is what we're asserting on.
jest.mock('@/hooks/useBootstrapAuth', () => ({
  useBootstrapAuth: () => ({ ready: true }),
}));

const { RootNavigator } = require('@/navigation/RootNavigator');

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, status: 'idle', error: null });
});

describe('RootNavigator', () => {
  it('renders AuthStack when there is no access token', () => {
    render(<RootNavigator />);
    expect(screen.getByText('AUTH_STACK')).toBeTruthy();
  });

  it('renders MainTabs once an access token is present', () => {
    useAuthStore.setState({ token: 'abc' });
    render(<RootNavigator />);
    expect(screen.getByText('MAIN_TABS')).toBeTruthy();
  });
});
