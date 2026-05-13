import { renderHook, waitFor } from '@testing-library/react-native';

import { useAuthStore } from '@/stores/useAuthStore';
import { useBootstrapAuth } from '@/hooks/useBootstrapAuth';

const mockClient = { post: jest.fn() };

jest.mock('@/lib/api', () => ({
  getApiClient: () => mockClient,
}));

beforeEach(() => {
  mockClient.post.mockReset();
  useAuthStore.setState({ user: null, token: null, status: 'idle', error: null });
});

describe('useBootstrapAuth', () => {
  it('flips ready=true once /auth/refresh resolves', async () => {
    mockClient.post.mockResolvedValueOnce({
      data: {
        user: {
          id: 'u1',
          email: 'a@b.co',
          name: 'A',
          avatarUrl: null,
          provider: 'local',
          createdAt: 'now',
        },
        accessToken: 'tok',
      },
    });

    const { result } = renderHook(() => useBootstrapAuth());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(useAuthStore.getState().token).toBe('tok');
    expect(mockClient.post).toHaveBeenCalledWith(
      '/auth/refresh',
      {},
      expect.objectContaining({ headers: { 'x-skip-auth-refresh': '1' } }),
    );
  });

  it('flips ready=true even when /auth/refresh rejects', async () => {
    mockClient.post.mockRejectedValueOnce(new Error('401'));

    const { result } = renderHook(() => useBootstrapAuth());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(useAuthStore.getState().token).toBeNull();
  });
});
