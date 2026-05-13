// Chat / cart session identifier. The backend keys carts and conversations
// by this id, so web reloads must keep it stable.
let cached: string | null = null;
const STORAGE_KEY = 'viridien.sessionId';

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function makeId(): string {
  // Prefer the platform's UUID generator when present.
  const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  // Fallback — sufficient uniqueness for a single-device demo session.
  const rand = Math.random().toString(36).slice(2, 10);
  return `sess-${Date.now().toString(36)}-${rand}`;
}

export function getSessionId(): string {
  if (cached) return cached;

  const storage = getStorage();
  const stored = storage?.getItem(STORAGE_KEY);
  if (stored) {
    cached = stored;
    return cached;
  }

  cached = makeId();
  storage?.setItem(STORAGE_KEY, cached);
  return cached;
}

export function _resetSessionForTests(): void {
  cached = null;
  getStorage()?.removeItem(STORAGE_KEY);
}
