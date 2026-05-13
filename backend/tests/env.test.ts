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
});
