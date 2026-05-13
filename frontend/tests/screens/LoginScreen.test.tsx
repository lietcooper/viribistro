import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { LoginScreen } from '@/screens/LoginScreen';
import { useAuthStore } from '@/stores/useAuthStore';

jest.mock('@/lib/oauth', () => ({
  openGoogleOAuth: jest.fn(),
}));

const makeNav = () => ({ navigate: jest.fn(), goBack: jest.fn() });

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, status: 'idle', error: null });
  const loginSpy = jest.fn();
  useAuthStore.setState({ login: loginSpy as any });
});

function getLogin(): jest.Mock {
  return useAuthStore.getState().login as unknown as jest.Mock;
}

describe('LoginScreen', () => {
  it('submits credentials to useAuthStore.login', async () => {
    getLogin().mockResolvedValueOnce(undefined);

    const navigation = makeNav();
    render(<LoginScreen navigation={navigation as any} route={{} as any} />);

    fireEvent.changeText(screen.getByTestId('login-email'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('login-password'), 'hunter22');

    await act(async () => {
      fireEvent.press(screen.getByTestId('login-submit'));
    });

    expect(getLogin()).toHaveBeenCalledWith('a@b.com', 'hunter22');
  });

  it('renders the inline error from the store when login fails', async () => {
    getLogin().mockImplementationOnce(async () => {
      useAuthStore.setState({ error: 'Invalid email or password', status: 'error' });
      throw new Error('401');
    });

    render(<LoginScreen navigation={makeNav() as any} route={{} as any} />);

    fireEvent.changeText(screen.getByTestId('login-email'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('login-password'), 'bad');

    await act(async () => {
      fireEvent.press(screen.getByTestId('login-submit'));
    });

    expect(screen.getByText('Invalid email or password')).toBeTruthy();
  });

  it('flags missing fields without calling the store', async () => {
    render(<LoginScreen navigation={makeNav() as any} route={{} as any} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('login-submit'));
    });

    expect(getLogin()).not.toHaveBeenCalled();
    expect(screen.getByText('Email and password are required')).toBeTruthy();
  });

  it('redirects to the OAuth start URL when the Google button is tapped', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openGoogleOAuth } = require('@/lib/oauth');

    render(<LoginScreen navigation={makeNav() as any} route={{} as any} />);
    fireEvent.press(screen.getByTestId('login-google'));

    expect(openGoogleOAuth).toHaveBeenCalledTimes(1);
  });

  it('navigates to Signup when the sign-up link is tapped', () => {
    const navigation = makeNav();
    render(<LoginScreen navigation={navigation as any} route={{} as any} />);

    fireEvent.press(screen.getByTestId('login-go-signup'));
    expect(navigation.navigate).toHaveBeenCalledWith('Signup');
  });
});
