import { Platform } from 'react-native';

import { consumeOAuthRedirectStatus, openGoogleOAuth } from '@/lib/oauth';
import { useToastStore } from '@/stores/useToastStore';

const originalPlatformOS = Platform.OS;

beforeEach(() => {
  useToastStore.setState({ visible: false, message: '', tone: 'info', shownAt: 0 });
});

afterEach(() => {
  // Reset Platform.OS so other test files aren't affected.
  Platform.OS = originalPlatformOS;
});

function stubWindow(props: {
  href?: string;
  assign?: jest.Mock;
  replaceState?: jest.Mock;
}) {
  Object.defineProperty(globalThis, 'window', {
    writable: true,
    configurable: true,
    value: {
      location: {
        href: props.href ?? 'https://demo.app/',
        assign: props.assign ?? jest.fn(),
      },
      history: { replaceState: props.replaceState ?? jest.fn() },
    },
  });
}

describe('openGoogleOAuth', () => {
  it('navigates the browser to the API base /auth/google on web', () => {
    // babel-preset-expo inlines EXPO_PUBLIC_* at build time, so the
    // base URL is whatever the test runner sees at module-load. We
    // assert on the path suffix instead of an exact URL.
    Platform.OS = 'web';
    const assign = jest.fn();
    stubWindow({ assign });

    openGoogleOAuth();

    expect(assign).toHaveBeenCalledTimes(1);
    const target = assign.mock.calls[0]?.[0] as string;
    expect(target).toMatch(/\/auth\/google$/);
  });
});

describe('consumeOAuthRedirectStatus', () => {
  it('is a no-op when no oauth_error param is present', () => {
    Platform.OS = 'web';
    const replaceState = jest.fn();
    stubWindow({ href: 'https://demo.app/?other=foo', replaceState });

    consumeOAuthRedirectStatus();

    expect(useToastStore.getState().visible).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('shows a toast and strips the oauth_error query param', () => {
    Platform.OS = 'web';
    const replaceState = jest.fn();
    stubWindow({
      href: 'https://demo.app/?oauth_error=Google%20declined',
      replaceState,
    });

    consumeOAuthRedirectStatus();

    expect(useToastStore.getState().visible).toBe(true);
    expect(useToastStore.getState().message).toBe('Google declined');
    expect(useToastStore.getState().tone).toBe('error');
    expect(replaceState).toHaveBeenCalledTimes(1);
    // Stripped href no longer contains oauth_error.
    const calledWith = replaceState.mock.calls[0]?.[2] as string | undefined;
    expect(calledWith).toBeDefined();
    expect(calledWith).not.toContain('oauth_error');
  });

  it('does nothing on non-web platforms', () => {
    Platform.OS = 'ios';
    consumeOAuthRedirectStatus();
    expect(useToastStore.getState().visible).toBe(false);
  });
});
