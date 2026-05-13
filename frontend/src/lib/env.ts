// Centralized accessor for EXPO_PUBLIC_* env vars. Keeps consuming
// modules from sprinkling `process.env.EXPO_PUBLIC_API_URL` everywhere
// and gives us one place to set defaults / validate.

const FALLBACK_API_URL = 'http://localhost:3000';

export function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!raw) return FALLBACK_API_URL;
  return raw.replace(/\/+$/, '');
}
