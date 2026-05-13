import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { _resetApiClientForTests, createApiClient } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';

// A tiny scriptable adapter so we don't need axios-mock-adapter.
// Each call to `next()` queues a response to be served in order.
// The adapter records every request it serves so tests can assert call
// counts and headers.
interface QueuedResponse {
  status: number;
  data?: unknown;
}

function makeScriptedAdapter() {
  const queue: QueuedResponse[] = [];
  const requests: InternalAxiosRequestConfig[] = [];
  const adapter = (config: InternalAxiosRequestConfig) => {
    requests.push(config);
    const next = queue.shift();
    if (!next) {
      return Promise.reject(new Error(`Unexpected request: ${config.method} ${config.url}`));
    }
    if (next.status >= 400) {
      const err: any = new Error(`Request failed with status ${next.status}`);
      err.config = config;
      err.response = { status: next.status, data: next.data, headers: {}, config };
      return Promise.reject(err);
    }
    return Promise.resolve({
      status: next.status,
      data: next.data,
      headers: {},
      config,
      statusText: 'OK',
    });
  };
  return {
    adapter,
    queue,
    requests,
    push(...items: QueuedResponse[]) {
      queue.push(...items);
    },
  };
}

function attachAdapter(client: AxiosInstance, adapter: any) {
  client.defaults.adapter = adapter;
}

const refreshSuccess = {
  status: 200,
  data: {
    user: {
      id: 'u1',
      email: 'a@b.com',
      name: 'Alice',
      avatarUrl: null,
      provider: 'local' as const,
      createdAt: new Date().toISOString(),
    },
    accessToken: 'new-token',
  },
};

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    token: 'stale-token',
    status: 'ready',
    error: null,
  });
  _resetApiClientForTests();
});

describe('createApiClient — auth refresh', () => {
  it('attaches the access token from the auth store to outgoing requests', async () => {
    const scripted = makeScriptedAdapter();
    const client = createApiClient({ baseURL: 'http://api.test' });
    attachAdapter(client, scripted.adapter);
    scripted.push({ status: 200, data: { ok: true } });

    await client.get('/api/menu');
    expect(scripted.requests[0]?.headers?.Authorization).toBe('Bearer stale-token');
  });

  it('on 401, calls /auth/refresh, stores the new token, and replays the original request', async () => {
    const scripted = makeScriptedAdapter();
    const client = createApiClient({ baseURL: 'http://api.test' });
    attachAdapter(client, scripted.adapter);

    // 1) original request → 401
    // 2) /auth/refresh → 200 with new token
    // 3) original request retry → 200
    scripted.push(
      { status: 401, data: { code: 'TOKEN_EXPIRED' } },
      refreshSuccess,
      { status: 200, data: { items: [] } },
    );

    const res = await client.get('/api/orders');

    expect(res.data).toEqual({ items: [] });
    expect(useAuthStore.getState().token).toBe('new-token');

    // Three requests: original, /auth/refresh, replay.
    expect(scripted.requests).toHaveLength(3);
    expect(scripted.requests[1]?.url).toBe('/auth/refresh');
    // Replay should carry the NEW token.
    expect(scripted.requests[2]?.headers?.Authorization).toBe('Bearer new-token');
  });

  it('coalesces concurrent 401s into a single /auth/refresh call (single-flight)', async () => {
    const scripted = makeScriptedAdapter();
    const client = createApiClient({ baseURL: 'http://api.test' });
    attachAdapter(client, scripted.adapter);

    // Two original 401s, ONE refresh, two retries succeed.
    scripted.push(
      { status: 401 },
      { status: 401 },
      refreshSuccess,
      { status: 200, data: { a: 1 } },
      { status: 200, data: { b: 2 } },
    );

    const [a, b] = await Promise.all([client.get('/api/a'), client.get('/api/b')]);

    expect(a.data).toEqual({ a: 1 });
    expect(b.data).toEqual({ b: 2 });

    const refreshCalls = scripted.requests.filter((r) => r.url === '/auth/refresh');
    expect(refreshCalls).toHaveLength(1);
  });

  it('clears the auth store and rejects when /auth/refresh itself fails with 401', async () => {
    const scripted = makeScriptedAdapter();
    const client = createApiClient({ baseURL: 'http://api.test' });
    attachAdapter(client, scripted.adapter);

    scripted.push(
      { status: 401 },
      { status: 401, data: { code: 'INVALID_REFRESH_TOKEN' } },
    );

    await expect(client.get('/api/orders')).rejects.toBeDefined();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('does not retry a 401 from /auth/refresh itself (prevents infinite loop)', async () => {
    const scripted = makeScriptedAdapter();
    const client = createApiClient({ baseURL: 'http://api.test' });
    attachAdapter(client, scripted.adapter);

    scripted.push({ status: 401 });

    await expect(
      client.post('/auth/refresh', {}, { headers: { 'x-skip-auth-refresh': '1' } }),
    ).rejects.toBeDefined();

    // Only one request fired — the interceptor opted out.
    expect(scripted.requests).toHaveLength(1);
  });
});
