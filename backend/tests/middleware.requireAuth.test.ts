import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../src/middleware/requireAuth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { signAccessToken } from '../src/services/auth.js';
import { logger } from '../src/lib/logger.js';

function makeApp(): express.Express {
  const app = express();
  app.get('/protected', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });
  app.use(errorHandler);
  return app;
}

describe('requireAuth middleware', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const res = await request(makeApp()).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_ACCESS_TOKEN');
  });

  it('returns 401 when the Authorization header is malformed', async () => {
    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', 'NotBearer foo');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_ACCESS_TOKEN');
  });

  it('returns 401 when the token is expired', async () => {
    const expired = jwt.sign(
      { sub: 'user_abc', email: 'a@b.com' },
      process.env.JWT_SECRET!,
      { expiresIn: '-1s' },
    );
    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('returns 401 when the token signature is invalid', async () => {
    const bogus = jwt.sign(
      { sub: 'user_abc', email: 'a@b.com' },
      'wrong-secret-32-bytes-of-padding-12345',
      { expiresIn: '15m' },
    );
    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', `Bearer ${bogus}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('logs the underlying verification error when the token is invalid', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    try {
      const bogus = jwt.sign(
        { sub: 'user_abc', email: 'a@b.com' },
        'wrong-secret-32-bytes-of-padding-12345',
        { expiresIn: '15m' },
      );
      const res = await request(makeApp())
        .get('/protected')
        .set('Authorization', `Bearer ${bogus}`);
      expect(res.status).toBe(401);
      // The middleware MUST log the failure — empty catch blocks are a
      // CLAUDE.md "no silent failures" violation.
      expect(warnSpy).toHaveBeenCalled();
      const [ctx, msg] = warnSpy.mock.calls[0]!;
      expect(msg).toMatch(/access token verification failed/i);
      expect((ctx as { err?: unknown }).err).toBeInstanceOf(Error);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('attaches req.user and calls next() when the token is valid', async () => {
    const token = signAccessToken({ sub: 'user_abc', email: 'a@b.com' });
    const res = await request(makeApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.sub).toBe('user_abc');
    expect(res.body.user.email).toBe('a@b.com');
  });
});
