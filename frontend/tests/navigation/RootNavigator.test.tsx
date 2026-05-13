// Verifies the auth-gating logic in RootNavigator: when the token in
// useAuthStore is null we mount AuthStack; when it's set we mount
// MainTabs. We stub the two stacks so the assertion is about which
// branch was rendered, not about the inner navigators (which need a
// fully-wired NavigationContainer to mount).
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

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
// don't need for this gating-logic test.
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Skip the bootstrap roundtrip; the navigator should treat us as
// "ready" immediately so the gating logic is what we're asserting on.
jest.mock('@/hooks/useBootstrapAuth', () => ({
  useBootstrapAuth: () => ({ ready: true }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
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
