// Auth store. Token lives in memory only (a leaked one survives until
// expiry — never persist to AsyncStorage / localStorage).
//
// Why the API client is imported lazily inside the actions: `lib/api.ts`
// imports this store to read the token on each request, so loading it
// here at the top would create a cycle. The lazy require also makes the
// store easier to test — we can stub api.ts via jest.mock.
import { create } from 'zustand';

import type { AuthResponse, User } from '@/types/api';

export type AuthStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AuthState {
  user: User | null;
  token: string | null;
  status: AuthStatus;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
}

function api() {
  return require('@/lib/api').getApiClient() as import('axios').AxiosInstance;
}

function applyAuth(set: (s: Partial<AuthState>) => void, data: AuthResponse) {
  set({ user: data.user, token: data.accessToken, status: 'ready', error: null });
}

function extractMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } } } | undefined;
  return e?.response?.data?.message ?? fallback;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  status: 'idle',
  error: null,

  async login(email, password) {
    set({ status: 'loading', error: null });
    try {
      const res = await api().post<AuthResponse>('/auth/login', { email, password });
      applyAuth(set, res.data);
    } catch (err) {
      set({ status: 'error', error: extractMessage(err, 'Login failed') });
      throw err;
    }
  },

  async register(email, password, name) {
    set({ status: 'loading', error: null });
    try {
      const res = await api().post<AuthResponse>('/auth/register', { email, password, name });
      applyAuth(set, res.data);
    } catch (err) {
      set({ status: 'error', error: extractMessage(err, 'Sign-up failed') });
      throw err;
    }
  },

  async logout() {
    try {
      await api().post('/auth/logout');
    } catch (err) {
      // Clear local state regardless — the user wants to sign out and
      // the refresh cookie will expire server-side. Log so failures are
      // still observable in dev / monitoring.
      console.warn('[auth] logout network call failed:', err);
    }
    set({ user: null, token: null, status: 'idle', error: null });
  },

  async bootstrap() {
    set({ status: 'loading' });
    try {
      const res = await api().post<AuthResponse>(
        '/auth/refresh',
        {},
        { headers: { 'x-skip-auth-refresh': '1' } },
      );
      applyAuth(set, res.data);
    } catch (err) {
      // Refresh failed (no cookie, expired, network) — fall back to
      // unauthenticated. Log so we can spot misconfigured backends in dev.
      console.warn('[auth] bootstrap failed:', err);
      set({ user: null, token: null, status: 'idle', error: null });
    }
  },
}));
