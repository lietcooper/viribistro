// The single axios instance used by every API call in the app.
//
// Auth model:
//   - The access token lives in `useAuthStore.token` (memory only).
//   - The refresh token is an httpOnly cookie set by the backend. We send
//     it on every request via `withCredentials: true`.
//   - On a 401 from a protected route, the response interceptor:
//       1. Acquires a single-flight refresh promise so concurrent 401s
//          only fire ONE /auth/refresh call.
//       2. Calls POST /auth/refresh; on success it stashes the new token
//          in `useAuthStore` and replays the original request once.
//       3. If refresh itself returns 401 (or any failure), clears the
//          auth store and propagates the original rejection.
//
// The instance is created lazily by `createApiClient()` (test-friendly).
// Production code imports the cached singleton via `getApiClient()`.
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import { getApiBaseUrl } from './env';
import { useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import type { AuthResponse } from '@/types/api';

// Request configs are augmented with a flag so we only retry once.
interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export interface CreateApiClientOptions {
  baseURL?: string;
}

// Single-flight refresh promise. While a refresh is in flight any other
// 401 awaits the same promise instead of starting a new one.
let refreshInFlight: Promise<string | null> | null = null;

function performRefresh(client: AxiosInstance): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await client.post<AuthResponse>(
        '/auth/refresh',
        {},
        {
          // Skip the response interceptor for this call so a refresh
          // 401 doesn't recursively trigger another refresh.
          headers: { 'x-skip-auth-refresh': '1' },
        },
      );
      const { accessToken, user } = res.data;
      useAuthStore.setState({ user, token: accessToken, status: 'ready', error: null });
      return accessToken;
    } catch (err) {
      // Refresh itself failed — clear auth state and let the original
      // 401 propagate. Log so backend / cookie misconfigurations are
      // observable in dev and monitoring.
      console.warn('[api] refresh failed:', err);
      useAuthStore.setState({
        user: null,
        token: null,
        status: 'idle',
        error: null,
      });
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export function createApiClient(opts: CreateApiClientOptions = {}): AxiosInstance {
  const client = axios.create({
    baseURL: opts.baseURL ?? getApiBaseUrl(),
    withCredentials: true,
    timeout: 30_000,
  });

  // Request interceptor — attach the access token (if any).
  client.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Response interceptor — handle 401 with single-flight refresh.
  client.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const original = error.config as RetryableConfig | undefined;
      const status = error.response?.status;

      // Don't intervene if:
      //  - the error has no config (network-level failure outside axios)
      //  - it isn't a 401
      //  - we already retried this request once
      //  - the request explicitly opted out (e.g. /auth/refresh itself)
      if (
        !original ||
        status !== 401 ||
        original._retry ||
        original.headers?.['x-skip-auth-refresh'] === '1'
      ) {
        // Surface non-401 failures as a toast so the user never gets
        // a silent dead-end. Auth flow handles its own messaging via
        // the auth store's `error` field, so skip the toast there.
        const url = original?.url ?? '';
        const isAuthCall = url.startsWith('/auth/');
        if (!isAuthCall && status !== 401) {
          const msg =
            status && status >= 500
              ? "The bistro's kitchen is overwhelmed — try again in a moment."
              : 'Something went wrong. Please try again.';
          useToastStore.getState().show(msg, 'error');
        }
        return Promise.reject(error);
      }

      original._retry = true;
      const newToken = await performRefresh(client);

      if (!newToken) {
        // Refresh failed — auth store has already been cleared by
        // performRefresh. Bubble the original 401 up so the caller can
        // decide what to do (typically: navigate to login).
        return Promise.reject(error);
      }

      // Replay with the new token. Clear the old Authorization header so
      // the request interceptor's fresh read of the store wins.
      if (original.headers) {
        delete original.headers.Authorization;
      }
      return client(original);
    },
  );

  return client;
}

// Cached singleton for production use.
let cachedClient: AxiosInstance | null = null;

export function getApiClient(): AxiosInstance {
  if (!cachedClient) cachedClient = createApiClient();
  return cachedClient;
}

// Test-only: reset the cached client and the in-flight refresh lock.
export function _resetApiClientForTests(): void {
  cachedClient = null;
  refreshInFlight = null;
}

export type { AxiosRequestConfig };
