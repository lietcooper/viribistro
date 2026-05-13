// Auth store behaviour tests. We stub `@/lib/api` so the store's lazy
// require returns a hand-rolled mock client.
import { useAuthStore } from '@/stores/useAuthStore';

const mockClient = {
  post: jest.fn(),
};

jest.mock('@/lib/api', () => ({
  getApiClient: () => mockClient,
}));

const sampleAuth = {
  user: {
    id: 'u1',
    email: 'a@b.com',
    name: 'Alice',
    avatarUrl: null,
    provider: 'local' as const,
    createdAt: new Date().toISOString(),
  },
  accessToken: 'access-1',
};

beforeEach(() => {
  mockClient.post.mockReset();
  useAuthStore.setState({ user: null, token: null, status: 'idle', error: null });
});

describe('useAuthStore.login', () => {
  it('posts to /auth/login and stores the user + token on success', async () => {
    mockClient.post.mockResolvedValueOnce({ data: sampleAuth });

    await useAuthStore.getState().login('a@b.com', 'pw');

    const state = useAuthStore.getState();
    expect(mockClient.post).toHaveBeenCalledWith('/auth/login', {
      email: 'a@b.com',
      password: 'pw',
    });
    expect(state.user?.email).toBe('a@b.com');
    expect(state.token).toBe('access-1');
    expect(state.status).toBe('ready');
    expect(state.error).toBeNull();
  });

  it('surfaces a friendly error message and rethrows on 401', async () => {
    mockClient.post.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Invalid email or password' } },
    });

    await expect(useAuthStore.getState().login('a@b.com', 'bad')).rejects.toBeDefined();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.status).toBe('error');
    expect(state.error).toBe('Invalid email or password');
  });
});

describe('useAuthStore.register', () => {
  it('posts to /auth/register and stores the result', async () => {
    mockClient.post.mockResolvedValueOnce({ data: sampleAuth });
    await useAuthStore.getState().register('a@b.com', 'pw', 'Alice');
    expect(mockClient.post).toHaveBeenCalledWith('/auth/register', {
      email: 'a@b.com',
      password: 'pw',
      name: 'Alice',
    });
    expect(useAuthStore.getState().token).toBe('access-1');
  });
});

describe('useAuthStore.logout', () => {
  it('calls /auth/logout and clears local state', async () => {
    useAuthStore.setState({
      user: sampleAuth.user,
      token: 'old',
      status: 'ready',
      error: null,
    });
    mockClient.post.mockResolvedValueOnce({ status: 204, data: {} });

    await useAuthStore.getState().logout();

    expect(mockClient.post).toHaveBeenCalledWith('/auth/logout');
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('clears state even when the logout request fails', async () => {
    useAuthStore.setState({
      user: sampleAuth.user,
      token: 'old',
      status: 'ready',
      error: null,
    });
    mockClient.post.mockRejectedValueOnce(new Error('network down'));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('useAuthStore.bootstrap', () => {
  it('hydrates state on a successful /auth/refresh response', async () => {
    mockClient.post.mockResolvedValueOnce({ data: sampleAuth });

    await useAuthStore.getState().bootstrap();

    expect(mockClient.post).toHaveBeenCalledWith(
      '/auth/refresh',
      {},
      { headers: { 'x-skip-auth-refresh': '1' } },
    );
    expect(useAuthStore.getState().token).toBe('access-1');
    expect(useAuthStore.getState().status).toBe('ready');
  });

  it('clears state on a failed refresh (no thrown error to the caller)', async () => {
    useAuthStore.setState({
      user: sampleAuth.user,
      token: 'stale',
      status: 'ready',
      error: null,
    });
    mockClient.post.mockRejectedValueOnce({ response: { status: 401 } });

    await expect(useAuthStore.getState().bootstrap()).resolves.toBeUndefined();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().status).toBe('idle');
  });
});
