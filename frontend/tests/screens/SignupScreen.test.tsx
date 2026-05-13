import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { SignupScreen } from '@/screens/SignupScreen';
import { useAuthStore } from '@/stores/useAuthStore';

jest.mock('@/lib/oauth', () => ({
  openGoogleOAuth: jest.fn(),
}));

const makeNav = () => ({ navigate: jest.fn(), goBack: jest.fn() });

beforeEach(() => {
  useAuthStore.setState({ user: null, token: null, status: 'idle', error: null });
  const registerSpy = jest.fn();
  useAuthStore.setState({ register: registerSpy as any });
});

function getRegister(): jest.Mock {
  return useAuthStore.getState().register as unknown as jest.Mock;
}

describe('SignupScreen', () => {
  it('posts name/email/password to useAuthStore.register', async () => {
    getRegister().mockResolvedValueOnce(undefined);

    render(<SignupScreen navigation={makeNav() as any} route={{} as any} />);
    fireEvent.changeText(screen.getByTestId('signup-name'), 'Alice');
    fireEvent.changeText(screen.getByTestId('signup-email'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('signup-password'), 'hunter22');

    await act(async () => {
      fireEvent.press(screen.getByTestId('signup-submit'));
    });

    expect(getRegister()).toHaveBeenCalledWith('a@b.com', 'hunter22', 'Alice');
  });

  it('blocks submit with an inline message when the password is too short', async () => {
    render(<SignupScreen navigation={makeNav() as any} route={{} as any} />);
    fireEvent.changeText(screen.getByTestId('signup-name'), 'Alice');
    fireEvent.changeText(screen.getByTestId('signup-email'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('signup-password'), 'short');

    await act(async () => {
      fireEvent.press(screen.getByTestId('signup-submit'));
    });

    expect(getRegister()).not.toHaveBeenCalled();
    expect(screen.getByText('Password must be at least 8 characters')).toBeTruthy();
  });

  it('navigates to Login when the sign-in link is tapped', () => {
    const navigation = makeNav();
    render(<SignupScreen navigation={navigation as any} route={{} as any} />);
    fireEvent.press(screen.getByTestId('signup-go-login'));
    expect(navigation.navigate).toHaveBeenCalledWith('Login');
  });

  it('flags missing name/email/password without calling the store', async () => {
    render(<SignupScreen navigation={makeNav() as any} route={{} as any} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('signup-submit'));
    });
    expect(getRegister()).not.toHaveBeenCalled();
    expect(
      screen.getByText('Name, email and password are all required'),
    ).toBeTruthy();
  });

  it('surfaces the API error message when register throws', async () => {
    getRegister().mockImplementationOnce(async () => {
      const err = new Error('409') as Error & {
        response?: { data?: { message?: string } };
      };
      err.response = { data: { message: 'Email already in use' } };
      throw err;
    });

    render(<SignupScreen navigation={makeNav() as any} route={{} as any} />);
    fireEvent.changeText(screen.getByTestId('signup-name'), 'Alice');
    fireEvent.changeText(screen.getByTestId('signup-email'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('signup-password'), 'hunter22');

    await act(async () => {
      fireEvent.press(screen.getByTestId('signup-submit'));
    });

    expect(screen.getByText('Email already in use')).toBeTruthy();
  });

  it('falls back to a generic message when register throws without a server message', async () => {
    getRegister().mockRejectedValueOnce(new Error('boom'));
    render(<SignupScreen navigation={makeNav() as any} route={{} as any} />);
    fireEvent.changeText(screen.getByTestId('signup-name'), 'Alice');
    fireEvent.changeText(screen.getByTestId('signup-email'), 'a@b.com');
    fireEvent.changeText(screen.getByTestId('signup-password'), 'hunter22');

    await act(async () => {
      fireEvent.press(screen.getByTestId('signup-submit'));
    });
    expect(screen.getByText('Could not create your account')).toBeTruthy();
  });

  it('redirects to the OAuth start URL when the Google button is tapped', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { openGoogleOAuth } = require('@/lib/oauth');
    render(<SignupScreen navigation={makeNav() as any} route={{} as any} />);
    fireEvent.press(screen.getByTestId('signup-google'));
    expect(openGoogleOAuth).toHaveBeenCalledTimes(1);
  });
});
