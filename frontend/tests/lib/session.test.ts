import { _resetSessionForTests, getSessionId } from '@/lib/session';

beforeEach(() => {
  _resetSessionForTests();
});

describe('getSessionId', () => {
  it('returns a stable id across calls within a session', () => {
    const a = getSessionId();
    const b = getSessionId();
    expect(a).toBe(b);
  });

  it('regenerates after a reset', () => {
    const a = getSessionId();
    _resetSessionForTests();
    const b = getSessionId();
    expect(a).not.toBe(b);
  });

  it('persists across module cache resets', () => {
    const store = new Map<string, string>();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
    try {
      _resetSessionForTests();
      const a = getSessionId();
      jest.isolateModules(() => {
        const { getSessionId: getFreshSessionId } = require('@/lib/session');
        expect(getFreshSessionId()).toBe(a);
      });
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original);
      } else {
        delete (globalThis as { localStorage?: Storage }).localStorage;
      }
    }
  });

  it('prefers crypto.randomUUID when present', () => {
    const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    const spy = cryptoLike?.randomUUID
      ? jest.spyOn(cryptoLike, 'randomUUID').mockReturnValue('uuid-from-crypto-12345')
      : undefined;
    if (!spy) {
      // No crypto.randomUUID in this jest env — exercise the fallback
      // branch instead.
      const id = getSessionId();
      expect(id).toMatch(/^sess-/);
      return;
    }
    try {
      const id = getSessionId();
      expect(id).toBe('uuid-from-crypto-12345');
    } finally {
      spy.mockRestore();
    }
  });

  it('matches the backend SessionId regex [A-Za-z0-9_-]+', () => {
    // The backend validates inbound sessionIds against this pattern.
    // crypto.randomUUID() output (8-4-4-4-12 hex with dashes) qualifies,
    // and so does the manual fallback ("sess-<base36>-<base36>").
    const id = getSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
