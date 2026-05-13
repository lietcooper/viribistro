// The exported chatRateLimit / loginRateLimit are no-ops under
// NODE_ENV=test (otherwise the supertest bursts in the rest of the suite
// would 429). This test re-imports the module with NODE_ENV temporarily
// flipped to 'production' so we exercise the real limiter logic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

async function importLimiter(): Promise<typeof import('../src/middleware/rateLimit.js')> {
  vi.resetModules();
  return import('../src/middleware/rateLimit.js');
}

function makeApp(handler: express.RequestHandler): Express {
  const app = express();
  app.post('/probe', handler, (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('rate limiters', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    vi.resetModules();
  });

  it('chatRateLimit returns 429 with structured error after the window cap', async () => {
    const { chatRateLimit } = await importLimiter();
    const app = makeApp(chatRateLimit);

    // chatRateLimit caps at 10/min. The 11th call must 429.
    for (let i = 0; i < 10; i++) {
      await request(app).post('/probe').expect(200);
    }
    const blocked = await request(app).post('/probe');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.message).toMatch(/chat/i);
  });

  it('loginRateLimit returns 429 after 5 attempts in a minute', async () => {
    const { loginRateLimit } = await importLimiter();
    const app = makeApp(loginRateLimit);

    for (let i = 0; i < 5; i++) {
      await request(app).post('/probe').expect(200);
    }
    const blocked = await request(app).post('/probe');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.message).toMatch(/login/i);
  });

  it('is a pass-through when NODE_ENV=test (no throttle in CI)', async () => {
    process.env.NODE_ENV = 'test';
    const { chatRateLimit } = await importLimiter();
    const app = makeApp(chatRateLimit);
    // Far above the 10/min cap — under test mode this must NOT 429.
    for (let i = 0; i < 30; i++) {
      await request(app).post('/probe').expect(200);
    }
  });
});
