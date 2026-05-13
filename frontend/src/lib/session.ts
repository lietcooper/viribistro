// Per-launch chat / cart session identifier. The backend keys carts and
// conversations by this id. It is regenerated each time the app boots —
// closing the tab abandons the in-progress cart, which is fine for a
// public demo. A logged-in user's *orders* are still persisted in the
// DB by user id, independent of the session.
let cached: string | null = null;

function makeId(): string {
  // Prefer the platform's UUID generator when present.
  const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoLike?.randomUUID) return cryptoLike.randomUUID();
  // Fallback — sufficient uniqueness for a single-device demo session.
  const rand = Math.random().toString(36).slice(2, 10);
  return `sess-${Date.now().toString(36)}-${rand}`;
}

export function getSessionId(): string {
  if (!cached) cached = makeId();
  return cached;
}

export function _resetSessionForTests(): void {
  cached = null;
}
