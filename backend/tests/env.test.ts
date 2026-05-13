import { describe, expect, it } from 'vitest';

describe('env loader', () => {
  it('parses required env vars from process.env', async () => {
    // .env.test is loaded by tests/helpers/setup.ts before this runs.
    const { loadEnv } = await import('../src/lib/env.js');
    const env = loadEnv();
    expect(env.DATABASE_URL).toMatch(/^postgresql:\/\//);
    expect(env.JWT_SECRET.length).toBeGreaterThan(0);
    expect(env.JWT_REFRESH_SECRET.length).toBeGreaterThan(0);
    expect(env.PORT).toBe(3001);
    expect(env.NODE_ENV).toBe('test');
    expect(env.FRONTEND_URL).toBe('http://localhost:8081');
  });

  it('throws when a required var is missing', async () => {
    const { loadEnv } = await import('../src/lib/env.js');
    expect(() =>
      loadEnv({
        // intentionally minimal — no DATABASE_URL etc.
        NODE_ENV: 'test',
      }),
    ).toThrow(/env/i);
  });

  it('requires GOOGLE_CALLBACK_URL whenever GOOGLE_CLIENT_ID is set', async () => {
    const { loadEnv } = await import('../src/lib/env.js');
    // A prod deploy that forgot GOOGLE_CALLBACK_URL must fail fast at boot
    // instead of silently shipping a broken OAuth redirect_uri.
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgresql://x:y@localhost:5433/z',
        JWT_SECRET: 'jwt-test-secret-32-bytes-padding-1',
        JWT_REFRESH_SECRET: 'jwt-refresh-secret-32-bytes-padding',
        ANTHROPIC_API_KEY: 'test-key',
        FRONTEND_URL: 'http://localhost:8081',
        GOOGLE_CLIENT_ID: 'oauth-client',
        GOOGLE_CLIENT_SECRET: 'oauth-secret',
        // GOOGLE_CALLBACK_URL deliberately absent.
        NODE_ENV: 'production',
      }),
    ).toThrow(/GOOGLE_CALLBACK_URL/);
  });

  it('allows blank Google OAuth config (anonymous-only deploy)', async () => {
    const { loadEnv } = await import('../src/lib/env.js');
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgresql://x:y@localhost:5433/z',
        JWT_SECRET: 'jwt-test-secret-32-bytes-padding-1',
        JWT_REFRESH_SECRET: 'jwt-refresh-secret-32-bytes-padding',
        ANTHROPIC_API_KEY: 'test-key',
        FRONTEND_URL: 'http://localhost:8081',
        // No Google config at all — Google routes will 503 at runtime,
        // but the rest of the app boots fine.
        NODE_ENV: 'production',
      }),
    ).not.toThrow();
  });
});
